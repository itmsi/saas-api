/**
 * Provisioning jobs: list, detail, retry, cleanup, cleanup-and-rerun (alur 4.4)
 */
const db = require('../../database')
const { stamp, alive, publicRow } = require('../../database')
const { AppError } = require('../../utils/errors')
const { pageOf, pageMeta } = require('../../utils/response')
const { createJob } = require('../../lib/jobs')
const { FAILED_JOB_STATUSES } = require('../../lib/job-plans')
const audit = require('../../lib/audit')

const CLIENT_STATUS_ON_RETRY = { provision: 'provisioning', deprovision: 'deprovisioning' }

const findJob = async (id, trx = db) => {
  const job = await alive(trx('provisioning_jobs')).where({ id }).first()
  if (!job) throw new AppError('NOT_FOUND')
  return job
}

/** Job lama yang sudah pernah di-retry tidak boleh di-retry lagi (pakai job terbarunya) */
const assertNoChild = async (trx, job) => {
  const child = await alive(trx('provisioning_jobs')).where({ parent_job_id: job.id }).first('id')
  if (child) throw new AppError('JOB_NOT_RETRYABLE', { details: { reason: 'already_retried', child_job_id: child.id } })
}

const list = async (query) => {
  const p = pageOf(query)
  const base = alive(db('provisioning_jobs as j'), 'j').join('clients as c', 'c.id', 'j.client_id')
  if (query.status) base.where('j.status', query.status)
  if (query.type) base.where('j.type', query.type)
  if (query.client_id) base.where('j.client_id', query.client_id)
  if (query.rollout_id) base.where('j.rollout_id', query.rollout_id)

  const [{ count }] = await base.clone().count({ count: '*' })
  const rows = await base
    .select('j.*', 'c.client_code', 'c.name as client_name')
    .orderBy('j.queued_at', 'desc')
    .limit(p.limit)
    .offset(p.offset)
  return { rows: rows.map(publicRow), meta: pageMeta(p, Number(count)) }
}

/** Detail job + semua step + error + respons logistics-api */
const detail = async (id) => {
  const job = await findJob(id)
  const [client, steps] = await Promise.all([
    db('clients').where({ id: job.client_id }).first('id', 'client_code', 'name', 'status'),
    alive(db('provisioning_steps')).where({ job_id: job.id }).orderBy('step_order'),
  ])
  return { ...publicRow(job), client, steps: steps.map(publicRow) }
}

/**
 * Retry job gagal -> job baru dengan parent_job_id = job lama.
 *  - provision status failed (ROLLBACK_ON_FAILURE=false) -> mode resume, lanjut dari step gagal
 *  - provision status rolled_back                        -> mode full
 *  - provision status rollback_failed                    -> pakai cleanup-and-rerun
 */
const retry = (id, ctx) => db.transaction(async (trx) => {
  const job = await findJob(id, trx)
  if (!FAILED_JOB_STATUSES.includes(job.status)) {
    throw new AppError('JOB_NOT_RETRYABLE', { details: { status: job.status } })
  }
  if (job.type === 'provision' && job.status === 'rollback_failed') {
    throw new AppError('JOB_NOT_RETRYABLE', { details: { reason: 'rollback_failed', hint: 'POST /provisioning-jobs/:id/cleanup-and-rerun' } })
  }
  await assertNoChild(trx, job)

  const resume = job.type === 'provision' && job.status === 'failed'
  const mode = resume ? 'resume' : 'full'
  const skipSteps = resume
    ? await trx('provisioning_steps').where({ job_id: job.id }).whereIn('status', ['success', 'skipped']).pluck('step_name')
    : []

  // cleanup_first sudah dijalankan oleh job sebelumnya, jangan diulang
  const { cleanup_first: _cleanupFirst, ...params } = job.params || {}

  const newJob = await createJob(trx, {
    clientId: job.client_id,
    type: job.type,
    mode,
    params,
    parentJobId: job.id,
    rolloutId: job.rollout_id,
    requestedBy: ctx.actorId,
    skipSteps,
    eventExtra: job.rollout_id ? { rollout_id: job.rollout_id, target: params.target || 'latest' } : {},
  })

  const clientStatus = CLIENT_STATUS_ON_RETRY[job.type]
  if (clientStatus) {
    await trx('clients').where({ id: job.client_id }).update(stamp.update({ status: clientStatus }, ctx.actorId))
  }
  // tenant ini dihitung ulang di rollout
  if (job.rollout_id && job.status === 'failed') {
    await trx('migration_rollouts').where({ id: job.rollout_id }).update(stamp.update({
      failed_count: trx.raw('GREATEST(failed_count - 1, 0)'), status: 'running', finished_at: null,
    }, ctx.actorId))
  }

  await audit.record({
    actorType: 'admin',
    actorId: ctx.actorId,
    action: 'job.retry',
    targetType: 'client',
    targetId: job.client_id,
    after: { parent_job_id: job.id, job_id: newJob.id, mode },
    ctx,
    trx,
  })
  return {
    job_id: newJob.id, parent_job_id: job.id, type: newJob.type, mode, status: newJob.status,
  }
})

/**
 * Cleanup (drop DB & role) job provision yang gagal.
 * rerun = true -> sekaligus provisioning ulang dari awal (untuk kasus rollback_failed)
 */
const cleanup = (id, { rerun }, ctx) => db.transaction(async (trx) => {
  const job = await findJob(id, trx)
  if (job.type !== 'provision' || !FAILED_JOB_STATUSES.includes(job.status)) {
    throw new AppError('JOB_NOT_RETRYABLE', { details: { type: job.type, status: job.status } })
  }
  await assertNoChild(trx, job)
  const client = await trx('clients').where({ id: job.client_id }).forUpdate().first()
  if (client.status !== 'provisioning_failed') {
    throw new AppError('INVALID_STATE', { details: { client_status: client.status } })
  }

  const newJob = await createJob(trx, {
    clientId: job.client_id,
    type: rerun ? 'provision' : 'cleanup',
    params: rerun ? { cleanup_first: true } : {},
    parentJobId: job.id,
    requestedBy: ctx.actorId,
  })
  if (rerun) {
    await trx('clients').where({ id: job.client_id }).update(stamp.update({ status: 'provisioning' }, ctx.actorId))
  }

  await audit.record({
    actorType: 'admin',
    actorId: ctx.actorId,
    action: rerun ? 'job.cleanup_and_rerun' : 'job.cleanup',
    targetType: 'client',
    targetId: job.client_id,
    after: { parent_job_id: job.id, job_id: newJob.id },
    ctx,
    trx,
  })
  return {
    job_id: newJob.id, parent_job_id: job.id, type: newJob.type, status: newJob.status,
  }
})

module.exports = {
  list, detail, retry, cleanup,
}

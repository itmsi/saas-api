/**
 * Rollout migrasi DB tenant (alur 4.5).
 */
const db = require('../../database')
const { stamp, alive, publicRow } = require('../../database')
const { AppError } = require('../../utils/errors')
const { pageOf, pageMeta } = require('../../utils/response')
const { createJob } = require('../../lib/jobs')
const { ACTIVE_JOB_STATUSES } = require('../../lib/job-plans')
const logisticsApi = require('../../clients/logistics-api.client')
const audit = require('../../lib/audit')

/** Versi migrasi terbaru dari GET logistics-api /internal/migrations/status */
const fetchLatestVersion = async () => {
  try {
    const { body } = await logisticsApi.migrationStatus()
    return body?.data ?? body
  } catch (err) {
    throw new AppError('UPSTREAM_ERROR', { details: { service: 'logistics-api', message: err.message, code: err.code } })
  }
}

/**
 * Buat 1 job migrate per tenant. Tenant yang sedang punya job aktif dilewati
 * (dikembalikan di `skipped`).
 */
const enqueueForClients = async (trx, rollout, clients, ctx, parentJobs = {}) => {
  const jobs = []
  const skipped = []
  // eslint-disable-next-line no-restricted-syntax
  for (const c of clients) {
    // eslint-disable-next-line no-await-in-loop
    const busy = await alive(trx('provisioning_jobs')).where({ client_id: c.id }).whereIn('status', ACTIVE_JOB_STATUSES).first('id')
    if (busy) {
      skipped.push({
        client_id: c.id, client_code: c.client_code, reason: 'job_active', job_id: busy.id,
      })
    } else {
      // eslint-disable-next-line no-await-in-loop
      const job = await createJob(trx, {
        clientId: c.id,
        type: 'migrate',
        params: { target: rollout.target_version },
        rolloutId: rollout.id,
        parentJobId: parentJobs[c.id] || null,
        requestedBy: ctx.actorId,
        eventExtra: { rollout_id: rollout.id, target: rollout.target_version },
      })
      jobs.push({ client_id: c.id, client_code: c.client_code, job_id: job.id })
    }
  }
  return { jobs, skipped }
}

/** Versi terbaru di logistics-api + jumlah tenant per schema_version */
const status = async () => {
  const [latest, perVersion] = await Promise.all([
    fetchLatestVersion().catch((err) => ({ error: err.details || err.message })),
    alive(db('tenant_db_configs as t'), 't')
      .join('clients as c', 'c.id', 't.client_id')
      .where('c.is_deleted', false)
      .whereIn('c.status', ['active', 'suspended'])
      .groupBy('t.schema_version')
      .select('t.schema_version')
      .count({ tenants: '*' }),
  ])
  return {
    logistics_api: latest,
    tenants_by_schema_version: perVersion.map((r) => ({ schema_version: r.schema_version, tenants: Number(r.tenants) })),
  }
}

/** Rollout ke semua tenant active (client_ids kosong) atau sebagian */
const rollout = async ({ client_ids: clientIds, target }, ctx) => {
  let targetVersion = target
  if (target === 'latest') {
    const latest = await fetchLatestVersion()
    targetVersion = latest?.latest_version || latest?.latest || latest?.schema_version || 'latest'
  }

  return db.transaction(async (trx) => {
    const q = alive(trx('clients')).where({ status: 'active' }).select('id', 'client_code')
    if (clientIds.length) q.whereIn('id', clientIds)
    const clients = await q
    if (!clients.length) {
      throw new AppError('VALIDATION_ERROR', { details: [{ field: 'client_ids', message: 'Tidak ada tenant active yang cocok' }] })
    }

    const [row] = await trx('migration_rollouts').insert(stamp.create({
      target_version: targetVersion,
      total_tenants: 0,
      requested_by: ctx.actorId,
    }, ctx.actorId)).returning('*')

    const { jobs, skipped } = await enqueueForClients(trx, row, clients, ctx)
    await trx('migration_rollouts').where({ id: row.id }).update(stamp.update({
      total_tenants: jobs.length,
      status: jobs.length ? 'running' : 'completed_with_errors',
      finished_at: jobs.length ? null : trx.fn.now(),
    }, ctx.actorId))

    await audit.record({
      actorType: 'admin',
      actorId: ctx.actorId,
      action: 'migration.rollout',
      targetType: 'migration_rollout',
      targetId: row.id,
      after: { target_version: targetVersion, jobs: jobs.length, skipped: skipped.length },
      ctx,
      trx,
    })
    return {
      rollout_id: row.id, target_version: targetVersion, total_tenants: jobs.length, jobs, skipped,
    }
  })
}

const listRollouts = async (query) => {
  const p = pageOf(query)
  const base = alive(db('migration_rollouts'))
  if (query.status) base.where({ status: query.status })
  const [{ count }] = await base.clone().count({ count: '*' })
  const rows = await base.orderBy('created_at', 'desc').limit(p.limit).offset(p.offset)
  return { rows: rows.map(publicRow), meta: pageMeta(p, Number(count)) }
}

/** Progress + tenant yang gagal */
const rolloutDetail = async (id) => {
  const row = await alive(db('migration_rollouts')).where({ id }).first()
  if (!row) throw new AppError('NOT_FOUND')
  const jobs = await alive(db('provisioning_jobs as j'), 'j')
    .join('clients as c', 'c.id', 'j.client_id')
    .where('j.rollout_id', row.id)
    .select('j.id as job_id', 'j.client_id', 'c.client_code', 'j.status', 'j.error_message', 'j.error_detail', 'j.parent_job_id', 'j.queued_at', 'j.finished_at')
    .orderBy('j.queued_at')
  const progress = jobs.reduce((acc, j) => ({ ...acc, [j.status]: (acc[j.status] || 0) + 1 }), {})
  return {
    ...publicRow(row),
    progress,
    failed: jobs.filter((j) => j.status === 'failed'),
    jobs,
  }
}

/** Ulangi tenant yang gagal (hanya job terakhir per tenant yang statusnya failed) */
const retryFailed = (id, ctx) => db.transaction(async (trx) => {
  const row = await trx('migration_rollouts').where({ id, is_deleted: false }).forUpdate().first()
  if (!row) throw new AppError('NOT_FOUND')

  const latestJobs = await trx.raw(`
    SELECT DISTINCT ON (j.client_id) j.id, j.client_id, j.status, c.client_code
    FROM provisioning_jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.rollout_id = ? AND j.is_deleted = false
    ORDER BY j.client_id, j.queued_at DESC
  `, [row.id])
  const failed = latestJobs.rows.filter((j) => j.status === 'failed')
  if (!failed.length) return { rollout_id: row.id, jobs: [], skipped: [] }

  const clients = failed.map((j) => ({ id: j.client_id, client_code: j.client_code }))
  const parents = Object.fromEntries(failed.map((j) => [j.client_id, j.id]))
  const { jobs, skipped } = await enqueueForClients(trx, row, clients, ctx, parents)

  await trx('migration_rollouts').where({ id: row.id }).update(stamp.update({
    failed_count: Math.max(0, row.failed_count - jobs.length),
    status: jobs.length ? 'running' : row.status,
    finished_at: jobs.length ? null : row.finished_at,
  }, ctx.actorId))
  await audit.record({
    actorType: 'admin',
    actorId: ctx.actorId,
    action: 'migration.retry_failed',
    targetType: 'migration_rollout',
    targetId: row.id,
    after: { jobs: jobs.length },
    ctx,
    trx,
  })
  return { rollout_id: row.id, jobs, skipped }
})

module.exports = {
  status, rollout, listRollouts, rolloutDetail, retryFailed,
}

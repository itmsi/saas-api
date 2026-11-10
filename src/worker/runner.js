/**
 * Menjalankan satu job provisioning (alur 4.2 & 4.3).
 *
 *  - step berurutan; tiap step: running -> success / failed (+ message, error, http_status, response_body)
 *  - error transient -> retry di step yang sama (TRANSIENT_RETRY_MAX, backoff TRANSIENT_BACKOFF_MS)
 *  - error permanent -> job gagal; jika tipe job mendukung rollback: compensate mundur
 *      sukses semua -> rolled_back | ada yang gagal -> rollback_failed (cleanup manual)
 */
const config = require('../config')
const db = require('../database')
const { stamp } = require('../database')
const logger = require('../utils/logger')
const { decrypt } = require('../lib/crypto')
const { classify } = require('../lib/errors')
const { truncateBody } = require('../clients/logistics-api.client')
const audit = require('../lib/audit')
const JOBS = require('./jobs')

const STEPS = {
  create_roles: require('./steps/create-roles.step'),
  create_database: require('./steps/create-database.step'),
  grant_privileges: require('./steps/grant-privileges.step'),
  run_migrations: require('./steps/run-migrations.step'),
  run_seeders: require('./steps/run-seeders.step'),
  verify: require('./steps/verify.step'),
  finalize: require('./steps/finalize.step'),
  ...require('./steps/maintenance.steps').steps,
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const errorDetail = (err) => {
  const detail = { code: err.code || null, transient: !!err.transient }
  if (err.detail) detail.detail = err.detail
  return detail
}

const updateStep = (id, data) => db('provisioning_steps').where({ id }).update(stamp.update(data))
const updateJob = (id, data) => db('provisioning_jobs').where({ id }).update(stamp.update(data))

/** Muat semua data yang dibutuhkan step */
const buildContext = async (job) => {
  const client = await db('clients').where({ id: job.client_id }).first()
  const tenant = await db('tenant_db_configs').where({ client_id: job.client_id, is_deleted: false }).first()
  if (!client || !tenant) throw new Error(`Client / tenant_db_configs untuk job ${job.id} tidak ditemukan`)
  const cluster = await db('db_clusters').where({ id: tenant.cluster_id }).first()

  const memo = {}
  const once = (key, fn) => () => {
    if (!(key in memo)) memo[key] = fn()
    return memo[key]
  }

  return {
    job,
    client,
    tenant,
    cluster,
    state: {},
    attempt: 0,
    secrets: {
      ownerPassword: once('owner', () => decrypt(tenant.db_owner_password_enc)),
      appPassword: once('app', () => decrypt(tenant.db_app_password_enc)),
    },
    httpOptions(stepName) {
      return {
        requestId: `${job.id}-${stepName}-${this.attempt}`,
        idempotencyKey: `${job.id}-${stepName}`,
      }
    },
    log: (msg) => logger.info(`[job ${job.id} ${job.type} ${client.client_code}] ${msg}`),
  }
}

/** Jalankan satu step dengan retry transient. @returns {{ ok: true } | { ok: false, error }} */
const runStep = async (ctx, row, impl) => {
  const maxRetry = config.worker.transientRetryMax
  const backoff = config.worker.transientBackoffMs
  let { attempt } = row

  // eslint-disable-next-line no-constant-condition
  for (let retry = 0; ; retry += 1) {
    attempt += 1
    ctx.attempt = attempt
    // eslint-disable-next-line no-await-in-loop
    await updateStep(row.id, {
      status: 'running', attempt, started_at: db.fn.now(), finished_at: null, error_message: null, error_detail: null,
    })
    ctx.log(`step ${row.step_name} mulai (attempt ${attempt})`)

    try {
      // eslint-disable-next-line no-await-in-loop
      const out = (await impl.run(ctx)) || {}
      // eslint-disable-next-line no-await-in-loop
      await updateStep(row.id, {
        status: 'success',
        message: out.message || null,
        http_status: out.http_status || null,
        response_body: out.response_body !== undefined ? JSON.stringify(truncateBody(out.response_body)) : null,
        finished_at: db.fn.now(),
      })
      ctx.log(`step ${row.step_name} sukses${out.message ? `: ${out.message}` : ''}`)
      return { ok: true }
    } catch (raw) {
      const err = classify(raw)
      const willRetry = err.transient && retry < maxRetry
      // eslint-disable-next-line no-await-in-loop
      await updateStep(row.id, {
        status: willRetry ? 'running' : 'failed',
        error_message: err.message.slice(0, 5000),
        error_detail: JSON.stringify(errorDetail(err)),
        http_status: err.httpStatus || null,
        response_body: err.responseBody !== undefined ? JSON.stringify(truncateBody(err.responseBody)) : null,
        finished_at: willRetry ? null : db.fn.now(),
      })
      logger.warn(`[job ${ctx.job.id}] step ${row.step_name} gagal (${err.transient ? 'transient' : 'permanent'}): ${err.message}`)
      if (!willRetry) return { ok: false, error: err }
      const wait = backoff[Math.min(retry, backoff.length - 1)] ?? 5000
      ctx.log(`retry ${row.step_name} dalam ${wait} ms`)
      // eslint-disable-next-line no-await-in-loop
      await sleep(wait)
    }
  }
}

/** Compensate mundur dari step gagal ke step 1. @returns {boolean} true jika semua berhasil */
const rollback = async (ctx, rows, failedIndex) => {
  let allOk = true
  for (let i = failedIndex; i >= 0; i -= 1) {
    const row = rows[i]
    const impl = STEPS[row.step_name]
    // Step yang sudah (sebagian) jalan: success, skipped (sukses di job induk), failed (mungkin setengah jalan)
    // eslint-disable-next-line no-continue
    if (!impl?.compensate || !['success', 'skipped', 'failed'].includes(row.status)) continue
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = (await impl.compensate(ctx)) || {}
      // eslint-disable-next-line no-await-in-loop
      await updateStep(row.id, { status: 'compensated', message: out.message || 'compensated' })
      ctx.log(`compensate ${row.step_name} sukses`)
    } catch (raw) {
      const err = classify(raw)
      allOk = false
      // eslint-disable-next-line no-await-in-loop
      await updateStep(row.id, {
        status: 'compensate_failed', error_message: `compensate: ${err.message}`.slice(0, 5000), error_detail: JSON.stringify(errorDetail(err)),
      })
      logger.error(`[job ${ctx.job.id}] compensate ${row.step_name} gagal: ${err.message}`)
    }
  }
  return allOk
}

/**
 * @param {object} job  baris provisioning_jobs (status sudah dicek 'queued' oleh consumer)
 */
const runJob = async (job) => {
  const def = JOBS[job.type]
  if (!def) throw new Error(`Tipe job tidak dikenal: ${job.type}`)

  await updateJob(job.id, {
    status: 'running',
    started_at: db.fn.now(),
    finished_at: null,
    worker_id: config.worker.id,
    attempt: job.attempt + 1,
    error_message: null,
    error_detail: null,
    failed_step: null,
  })
  const ctx = await buildContext({ ...job, attempt: job.attempt + 1 })
  ctx.log(`mulai (mode ${job.mode})`)

  const rows = await db('provisioning_steps').where({ job_id: job.id, is_deleted: false }).orderBy('step_order')

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    // eslint-disable-next-line no-continue
    if (row.status === 'skipped' || row.status === 'success') continue

    const impl = STEPS[row.step_name]
    if (!impl) throw new Error(`Step tidak dikenal: ${row.step_name}`)

    // eslint-disable-next-line no-await-in-loop
    const result = await runStep(ctx, row, impl)
    if (!result.ok) {
      row.status = 'failed'
      ctx.failedStep = row.step_name
      const { error } = result

      const failure = {
        failed_step: row.step_name,
        error_message: error.message.slice(0, 5000),
        error_detail: JSON.stringify({ step: row.step_name, ...errorDetail(error), http_status: error.httpStatus || null }),
      }

      let finalStatus = 'failed'
      if (def.rollback()) {
        // eslint-disable-next-line no-await-in-loop
        await updateJob(job.id, { ...failure, status: 'rolling_back' })
        ctx.log(`rollback dari step ${row.step_name}`)
        // eslint-disable-next-line no-await-in-loop
        const allOk = await rollback(ctx, rows, i)
        finalStatus = allOk ? 'rolled_back' : 'rollback_failed'
      }

      // eslint-disable-next-line no-await-in-loop
      await def.onFailure(ctx, error).catch((e) => logger.error(`[job ${job.id}] onFailure: ${e.message}`))
      // eslint-disable-next-line no-await-in-loop
      await updateJob(job.id, { ...failure, status: finalStatus, finished_at: db.fn.now() })
      // eslint-disable-next-line no-await-in-loop
      await audit.record({
        actorType: 'worker', actorId: config.worker.id, action: `job.${job.type}.${finalStatus}`, targetType: 'client', targetId: job.client_id, after: { job_id: job.id, ...failure },
      })
      ctx.log(`selesai: ${finalStatus}`)
      return finalStatus
    }
    row.status = 'success'
  }

  await updateJob(job.id, { status: 'success', finished_at: db.fn.now() })
  await audit.record({
    actorType: 'worker', actorId: config.worker.id, action: `job.${job.type}.success`, targetType: 'client', targetId: job.client_id, after: { job_id: job.id },
  })
  ctx.log('selesai: success')
  return 'success'
}

module.exports = { runJob, STEPS }

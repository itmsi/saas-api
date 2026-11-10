/**
 * Job `running` milik WORKER_ID ini yang terhenti > WORKER_INTERRUPTED_AFTER_MS (default 15 menit)
 * ditandai failed dengan error WORKER_INTERRUPTED, lalu bisa di-retry admin.
 * Dijalankan saat worker start dan berkala (job yang sedang dikerjakan proses ini dikecualikan).
 */
const config = require('../config')
const db = require('../database')
const { stamp } = require('../database')
const logger = require('../utils/logger')

const recoverInterrupted = async (excludeJobIds = []) => {
  const cutoff = new Date(Date.now() - config.worker.interruptedAfterMs)
  const q = db('provisioning_jobs')
    .where({ worker_id: config.worker.id, is_deleted: false })
    .whereIn('status', ['running', 'rolling_back'])
    .where('started_at', '<', cutoff)
  if (excludeJobIds.length) q.whereNotIn('id', excludeJobIds)
  const jobs = await q.select('id', 'type', 'client_id')
  if (!jobs.length) return 0

  await db.transaction(async (trx) => {
    const ids = jobs.map((j) => j.id)
    await trx('provisioning_jobs').whereIn('id', ids).update(stamp.update({
      status: 'failed', error_message: 'WORKER_INTERRUPTED', finished_at: trx.fn.now(),
    }))
    await trx('provisioning_steps').whereIn('job_id', ids).where({ status: 'running' }).update(stamp.update({
      status: 'failed', error_message: 'WORKER_INTERRUPTED', finished_at: trx.fn.now(),
    }))
    const provisionClients = jobs.filter((j) => j.type === 'provision').map((j) => j.client_id)
    if (provisionClients.length) {
      await trx('clients').whereIn('id', provisionClients).where({ status: 'provisioning' })
        .update(stamp.update({ status: 'provisioning_failed', status_reason: 'WORKER_INTERRUPTED' }))
    }
  })
  logger.warn(`${jobs.length} job ditandai WORKER_INTERRUPTED: ${jobs.map((j) => j.id).join(', ')}`)
  return jobs.length
}

module.exports = { recoverInterrupted }

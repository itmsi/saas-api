/**
 * Membuat job provisioning: provisioning_jobs + provisioning_steps + outbox_events
 * dalam SATU transaksi (pola outbox). Worker yang mem-publish ke RabbitMQ.
 */
const { stamp } = require('../database')
const { AppError } = require('../utils/errors')
const { stepsFor, ACTIVE_JOB_STATUSES } = require('./job-plans')
const { ROUTING_KEY_BY_JOB_TYPE } = require('./rabbit')

/**
 * @param {import('knex').Knex.Transaction} trx
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {string} opts.type             provision | migrate | cleanup | deprovision | rotate_password | reset_system_user
 * @param {'full'|'resume'} [opts.mode]
 * @param {object} [opts.params]
 * @param {string} [opts.parentJobId]
 * @param {string} [opts.rolloutId]
 * @param {string} [opts.requestedBy]    id admin
 * @param {string[]} [opts.skipSteps]     nama step yang sudah sukses di job induk (mode resume)
 * @param {object} [opts.eventExtra]     field tambahan untuk payload pesan
 */
const createJob = async (trx, {
  clientId, type, mode = 'full', params = {}, parentJobId = null, rolloutId = null,
  requestedBy = null, skipSteps = [], eventExtra = {},
}) => {
  const active = await trx('provisioning_jobs')
    .where({ client_id: clientId, is_deleted: false })
    .whereIn('status', ACTIVE_JOB_STATUSES)
    .first('id', 'type', 'status')
  if (active) throw new AppError('JOB_ALREADY_RUNNING', { details: { job_id: active.id, type: active.type, status: active.status } })

  const [job] = await trx('provisioning_jobs').insert(stamp.create({
    client_id: clientId,
    type,
    status: 'queued',
    mode,
    params: JSON.stringify(params),
    parent_job_id: parentJobId,
    rollout_id: rolloutId,
    requested_by: requestedBy,
  }, requestedBy)).returning('*')

  const skip = new Set(skipSteps)
  const steps = stepsFor(type, params).map((s) => stamp.create({
    ...s,
    job_id: job.id,
    status: skip.has(s.step_name) ? 'skipped' : 'pending',
    message: skip.has(s.step_name) ? `Sudah sukses di job ${parentJobId}` : null,
  }, requestedBy))
  await trx('provisioning_steps').insert(steps)

  const routingKey = ROUTING_KEY_BY_JOB_TYPE[type]
  await trx('outbox_events').insert(stamp.create({
    event_type: routingKey,
    routing_key: routingKey,
    payload: JSON.stringify({ job_id: job.id, client_id: clientId, ...eventExtra }),
  }, requestedBy))

  return job
}

module.exports = { createJob }

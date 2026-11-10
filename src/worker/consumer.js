/**
 * Consumer RabbitMQ untuk queue provisioning.provision / .migrate / .maintenance.
 * Manual ack setelah status job tersimpan. Pesan hanya berisi { job_id, client_id, ... }.
 */
const config = require('../config')
const db = require('../database')
const { stamp } = require('../database')
const logger = require('../utils/logger')
const rabbit = require('../lib/rabbit')
const { tryLockClient } = require('../lib/lock')
const { runJob } = require('./runner')

const inFlight = new Map() // job_id -> Promise

const handle = async (channel, msg) => {
  let payload
  try {
    payload = JSON.parse(msg.content.toString())
  } catch (err) {
    logger.error(`Pesan rusak di ${msg.fields.routingKey}, dikirim ke DLQ`)
    return channel.nack(msg, false, false)
  }

  const job = await db('provisioning_jobs').where({ id: payload.job_id, is_deleted: false }).first()
  if (!job) {
    logger.error(`Job ${payload.job_id} tidak ditemukan, dikirim ke DLQ`)
    return channel.nack(msg, false, false)
  }
  // Pesan duplikat / job sudah diproses
  if (job.status !== 'queued') {
    logger.info(`Job ${job.id} status ${job.status}, pesan di-ack (duplikat)`)
    return channel.ack(msg)
  }

  const lock = await tryLockClient(job.client_id)
  if (!lock) {
    logger.warn(`Client ${job.client_id} sedang dikunci, job ${job.id} dicoba lagi nanti`)
    setTimeout(() => channel.nack(msg, false, true), config.worker.lockRetryDelayMs)
    return undefined
  }

  const work = (async () => {
    try {
      // Cek ulang setelah lock (bisa saja worker lain baru selesai memproses)
      const fresh = await db('provisioning_jobs').where({ id: job.id }).first('status')
      if (fresh.status !== 'queued') return
      await runJob(job)
    } catch (err) {
      logger.error(`Job ${job.id} error tak terduga: ${err.stack || err}`)
      await db('provisioning_jobs').where({ id: job.id }).update(stamp.update({
        status: 'failed',
        error_message: `WORKER_ERROR: ${err.message}`.slice(0, 5000),
        finished_at: db.fn.now(),
      })).catch(() => {})
    } finally {
      await lock.release().catch((e) => logger.error(`Lepas lock gagal: ${e.message}`))
    }
  })()

  inFlight.set(job.id, work)
  try {
    await work
    channel.ack(msg)
  } finally {
    inFlight.delete(job.id)
  }
  return undefined
}

const start = async (connection) => {
  const channels = []
  const tags = []
  // eslint-disable-next-line no-restricted-syntax
  for (const q of Object.values(rabbit.QUEUES)) {
    // eslint-disable-next-line no-await-in-loop
    const channel = await connection.createChannel()
    // eslint-disable-next-line no-await-in-loop
    await channel.prefetch(q.prefetch)
    // eslint-disable-next-line no-await-in-loop
    const { consumerTag } = await channel.consume(q.name, (msg) => {
      if (!msg) return
      handle(channel, msg).catch((err) => {
        logger.error(`Consumer ${q.name}: ${err.stack || err}`)
        setTimeout(() => { try { channel.nack(msg, false, true) } catch (e) { /* channel tertutup */ } }, config.worker.lockRetryDelayMs)
      })
    }, { noAck: false })
    channels.push(channel)
    tags.push({ channel, consumerTag })
    logger.info(`Consume ${q.name} (prefetch ${q.prefetch})`)
  }

  return {
    inFlight,
    /** Berhenti consume, tunggu job berjalan selesai (maks timeoutMs) */
    stop: async (timeoutMs) => {
      await Promise.all(tags.map(({ channel, consumerTag }) => channel.cancel(consumerTag).catch(() => {})))
      if (inFlight.size) {
        logger.info(`Menunggu ${inFlight.size} job selesai (maks ${timeoutMs} ms)...`)
        await Promise.race([
          Promise.allSettled([...inFlight.values()]),
          new Promise((resolve) => { setTimeout(resolve, timeoutMs).unref() }),
        ])
      }
      await Promise.all(channels.map((c) => c.close().catch(() => {})))
    },
  }
}

module.exports = { start, inFlight }

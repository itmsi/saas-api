/**
 * Outbox relay: baca outbox_events yang belum terkirim -> publish ke RabbitMQ
 * (confirm channel) -> set published_at. Aman dijalankan di beberapa worker
 * karena memakai FOR UPDATE SKIP LOCKED.
 */
const config = require('../config')
const db = require('../database')
const logger = require('../utils/logger')
const rabbit = require('../lib/rabbit')

const publish = (channel, row) => new Promise((resolve, reject) => {
  const payload = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload)
  channel.publish(rabbit.exchange, row.routing_key, Buffer.from(payload), {
    persistent: true,
    contentType: 'application/json',
    messageId: String(row.id),
    type: row.event_type,
    timestamp: Math.floor(Date.now() / 1000),
  }, (err) => (err ? reject(err) : resolve()))
})

const tick = async (channel) => db.transaction(async (trx) => {
  const rows = await trx('outbox_events')
    .whereNull('published_at')
    .where({ is_deleted: false })
    .orderBy('id')
    .limit(config.worker.outboxBatchSize)
    .forUpdate()
    .skipLocked()

  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await publish(channel, row)
      // eslint-disable-next-line no-await-in-loop
      await trx('outbox_events').where({ id: row.id }).update({ published_at: trx.fn.now(), attempts: row.attempts + 1, last_error: null })
    } catch (err) {
      logger.error(`Outbox ${row.id} gagal publish: ${err.message}`)
      // eslint-disable-next-line no-await-in-loop
      await trx('outbox_events').where({ id: row.id }).update({ attempts: row.attempts + 1, last_error: err.message.slice(0, 2000) })
      break // kemungkinan channel bermasalah; coba lagi di tick berikutnya
    }
  }
  return rows.length
})

const start = async (connection) => {
  const channel = await connection.createConfirmChannel()
  let stopped = false
  let timer
  let running = Promise.resolve()
  const state = { lastTickAt: null, lastError: null }

  const loop = async () => {
    if (stopped) return
    running = tick(channel)
      .then((count) => {
        state.lastTickAt = new Date()
        state.lastError = null
        return count
      })
      .catch((err) => {
        state.lastError = err.message
        logger.error(`Outbox relay: ${err.message}`)
        return 0
      })
    const count = await running
    if (!stopped) timer = setTimeout(loop, count >= config.worker.outboxBatchSize ? 0 : config.worker.outboxPollIntervalMs)
  }
  loop()

  return {
    state,
    stop: async () => {
      stopped = true
      clearTimeout(timer)
      await running
      await channel.close().catch(() => {})
    },
  }
}

module.exports = { start, tick }

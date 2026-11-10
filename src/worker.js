/**
 * Entry proses saas-worker: outbox relay + consumer RabbitMQ (provisioning).
 *   npm run start:worker
 *
 * Jika koneksi RabbitMQ putus, proses keluar (exit 1) dan di-restart oleh
 * Docker / PM2. Job yang terpotong ditandai WORKER_INTERRUPTED saat start.
 */
const config = require('./config')
const logger = require('./utils/logger')
const db = require('./database')
const cache = require('./lib/cache')
const rabbit = require('./lib/rabbit')
const outboxRelay = require('./worker/outbox-relay')
const consumer = require('./worker/consumer')
const { recoverInterrupted } = require('./worker/recovery')
const health = require('./worker/health')

let shuttingDown = false
let relay
let consumers
let httpServer
let recoveryTimer
const status = { rabbitmq: 'down', consumers: 'stopped' }

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} diterima, menghentikan worker...`)
  setTimeout(() => process.exit(1), config.worker.shutdownTimeoutMs + 15000).unref()

  clearInterval(recoveryTimer)
  if (consumers) await consumers.stop(config.worker.shutdownTimeoutMs)
  if (relay) await relay.stop()
  await rabbit.close()
  await Promise.allSettled([db.destroy(), cache.close()])
  if (httpServer) httpServer.close()
  logger.info('Worker berhenti')
  process.exit(exitCode)
}

const main = async () => {
  httpServer = health.create(() => ({
    ...status,
    in_flight_jobs: [...consumer.inFlight.keys()],
    outbox: relay ? relay.state : null,
  })).listen(config.worker.healthPort, () => logger.info(`Worker health server port ${config.worker.healthPort}`))

  await recoverInterrupted()
  recoveryTimer = setInterval(() => {
    recoverInterrupted([...consumer.inFlight.keys()]).catch((err) => logger.error(`Recovery: ${err.message}`))
  }, 60 * 1000)

  const connection = await rabbit.connect()
  status.rabbitmq = 'up'
  connection.on('close', () => {
    status.rabbitmq = 'down'
    if (!shuttingDown) {
      logger.error('Koneksi RabbitMQ putus, worker keluar agar di-restart')
      process.exit(1)
    }
  })

  const setup = await connection.createChannel()
  await rabbit.assertTopology(setup)
  await setup.close()

  relay = await outboxRelay.start(connection)
  consumers = await consumer.start(connection)
  status.consumers = 'running'
  logger.info(`saas-worker ${config.worker.id} (${config.app.env}) siap. ROLLBACK_ON_FAILURE=${config.worker.rollbackOnFailure}`)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => logger.error(`Unhandled rejection: ${reason?.stack || reason}`))
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack || err}`)
  shutdown('uncaughtException', 1)
})

main().catch((err) => {
  logger.error(`Worker gagal start: ${err.stack || err}`)
  process.exit(1)
})

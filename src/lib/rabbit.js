/**
 * Koneksi RabbitMQ + topologi.
 *
 * Exchange `tenant` (topic, durable), DLX `tenant.dlx` -> queue provisioning.dlq
 */
const amqp = require('amqplib')
const config = require('../config')
const logger = require('../utils/logger')

const { exchange, deadLetterExchange } = config.rabbitmq

const QUEUES = {
  provision: {
    name: 'provisioning.provision',
    prefetch: 1,
    routingKeys: ['tenant.provision.requested'],
  },
  migrate: {
    name: 'provisioning.migrate',
    prefetch: 3,
    routingKeys: ['tenant.migrate.requested'],
  },
  maintenance: {
    name: 'provisioning.maintenance',
    prefetch: 1,
    routingKeys: [
      'tenant.cleanup.requested',
      'tenant.deprovision.requested',
      'tenant.rotate_password.requested',
      'tenant.reset_system_user.requested',
    ],
  },
}
const DLQ = 'provisioning.dlq'

/** Routing key untuk tiap tipe job */
const ROUTING_KEY_BY_JOB_TYPE = {
  provision: 'tenant.provision.requested',
  migrate: 'tenant.migrate.requested',
  cleanup: 'tenant.cleanup.requested',
  deprovision: 'tenant.deprovision.requested',
  rotate_password: 'tenant.rotate_password.requested',
  reset_system_user: 'tenant.reset_system_user.requested',
}

let connection

const connect = async () => {
  if (connection) return connection
  connection = await amqp.connect(config.rabbitmq.url)
  connection.on('error', (err) => logger.error(`RabbitMQ: ${err.message}`))
  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed')
    connection = undefined
  })
  return connection
}

const assertTopology = async (channel) => {
  await channel.assertExchange(exchange, 'topic', { durable: true })
  await channel.assertExchange(deadLetterExchange, 'fanout', { durable: true })
  await channel.assertQueue(DLQ, { durable: true })
  await channel.bindQueue(DLQ, deadLetterExchange, '')

  // eslint-disable-next-line no-restricted-syntax
  for (const q of Object.values(QUEUES)) {
    // eslint-disable-next-line no-await-in-loop
    await channel.assertQueue(q.name, { durable: true, deadLetterExchange })
    // eslint-disable-next-line no-restricted-syntax
    for (const key of q.routingKeys) {
      // eslint-disable-next-line no-await-in-loop
      await channel.bindQueue(q.name, exchange, key)
    }
  }
}

/** Dipakai health check proses API */
const ping = async () => {
  const conn = await connect()
  const ch = await conn.createChannel()
  await ch.checkExchange(exchange).catch(() => {}) // exchange mungkin belum dibuat worker
  await ch.close()
  return true
}

const close = async () => {
  if (connection) await connection.close().catch(() => {})
  connection = undefined
}

module.exports = {
  connect, assertTopology, ping, close, QUEUES, DLQ, ROUTING_KEY_BY_JOB_TYPE, exchange,
}

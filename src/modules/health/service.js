const db = require('../../database')
const cache = require('../../lib/cache')
const rabbit = require('../../lib/rabbit')

const check = async (fn, timeoutMs = 3000) => {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), timeoutMs).unref() }),
    ])
    return 'up'
  } catch (err) {
    return 'down'
  }
}

const liveness = () => ({ status: 'ok', uptime_seconds: Math.round(process.uptime()) })

/** Cek Postgres, RabbitMQ, Redis */
const readiness = async () => {
  const [postgres, rabbitmq, redis] = await Promise.all([
    check(() => db.raw('select 1')),
    check(() => rabbit.ping()),
    check(() => cache.ping()),
  ])
  const healthy = postgres === 'up' && rabbitmq === 'up' && redis === 'up'
  return {
    healthy,
    data: {
      status: healthy ? 'ok' : 'degraded', postgres, rabbitmq, redis, uptime_seconds: Math.round(process.uptime()),
    },
  }
}

module.exports = { liveness, readiness }

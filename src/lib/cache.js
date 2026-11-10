/**
 * Cache tenant di Redis + channel invalidasi.
 *
 *   tenant:{client_code}, tenant:id:{client_id}  -> hasil resolve (TTL 10 menit)
 *   channel tenant-invalidate                   -> { client_id, client_code, reason }
 *
 * Redis bersifat best effort: jika Redis mati, resolve tetap jalan dari DB
 * (hanya dicatat di log), supaya logistics-api tidak ikut mati.
 */
const Redis = require('ioredis')
const config = require('../config')
const logger = require('../utils/logger')

let client

const getRedis = () => {
  if (!client) {
    client = new Redis(config.redis.url, {
      // Perintah boleh antre sebentar saat koneksi belum siap (mis. tepat setelah start),
      // tapi dibatalkan setelah 2 detik agar request tidak menggantung jika Redis mati.
      enableOfflineQueue: true,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    })
    client.on('error', (err) => logger.warn(`Redis: ${err.message}`))
  }
  return client
}

const keys = {
  byCode: (code) => `tenant:${code}`,
  byId: (id) => `tenant:id:${id}`,
}

const getTenant = async ({ code, id }) => {
  try {
    const raw = await getRedis().get(code ? keys.byCode(code) : keys.byId(id))
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    logger.warn(`Redis get gagal: ${err.message}`)
    return null
  }
}

const setTenant = async (tenant) => {
  try {
    const value = JSON.stringify(tenant)
    const ttl = config.redis.tenantTtlSeconds
    await getRedis().multi()
      .set(keys.byCode(tenant.client_code), value, 'EX', ttl)
      .set(keys.byId(tenant.client_id), value, 'EX', ttl)
      .exec()
  } catch (err) {
    logger.warn(`Redis set gagal: ${err.message}`)
  }
}

/** Hapus cache + beri tahu logistics-api untuk menutup pool tenant */
const invalidateTenant = async ({ client_id, client_code }, reason) => {
  try {
    const redis = getRedis()
    await redis.del(keys.byCode(client_code), keys.byId(client_id))
    await redis.publish(config.redis.invalidateChannel, JSON.stringify({ client_id, client_code, reason }))
  } catch (err) {
    logger.warn(`Invalidasi cache tenant ${client_code} gagal: ${err.message}`)
  }
}

const ping = async () => (await getRedis().ping()) === 'PONG'

const close = async () => {
  if (client) await client.quit().catch(() => client.disconnect())
  client = undefined
}

module.exports = {
  getTenant, setTenant, invalidateTenant, ping, close,
}

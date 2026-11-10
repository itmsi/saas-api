/**
 * Advisory lock per client di saas_core: pg_try_advisory_lock(hashtext(client_id)).
 * Lock level session, jadi koneksi dipegang selama job berjalan lalu dilepas.
 */
const db = require('../database')

/** @returns {Promise<null | { release: () => Promise<void> }>} null jika lock dipegang proses lain */
const tryLockClient = async (clientId) => {
  const conn = await db.client.acquireConnection()
  let locked = false
  try {
    const { rows } = await conn.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [clientId])
    locked = rows[0].locked
  } finally {
    if (!locked) await db.client.releaseConnection(conn)
  }
  if (!locked) return null

  return {
    release: async () => {
      try {
        await conn.query('SELECT pg_advisory_unlock(hashtext($1))', [clientId])
      } finally {
        await db.client.releaseConnection(conn)
      }
    },
  }
}

module.exports = { tryLockClient }

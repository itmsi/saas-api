/**
 * Health server worker (WORKER_HEALTH_PORT, jaringan internal saja).
 *
 *   GET  /health                           status worker
 *   POST /clusters/:id/test-connection     tes role provisioner (dipanggil saas-api, X-Internal-Key provisioning)
 */
const express = require('express')
const config = require('../config')
const db = require('../database')
const { withAdmin } = require('../lib/pg-admin')
const { safeEqual } = require('../middlewares/internal-key')

const create = (status) => {
  const app = express()
  app.disable('x-powered-by')

  app.get('/health', async (req, res) => {
    const s = status()
    let postgres = 'up'
    try { await db.raw('select 1') } catch (e) { postgres = 'down' }
    const healthy = s.rabbitmq === 'up' && postgres === 'up'
    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: {
        worker_id: config.worker.id, postgres, ...s, uptime_seconds: Math.round(process.uptime()),
      },
    })
  })

  app.post('/clusters/:id/test-connection', async (req, res) => {
    if (!safeEqual(req.headers['x-internal-key'], config.internal.provisioningKey)) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_INTERNAL_KEY' } })
    }
    const cluster = await db('db_clusters').where({ id: req.params.id, is_deleted: false }).first().catch(() => null)
    if (!cluster) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })

    const started = Date.now()
    try {
      const info = await withAdmin(cluster, async (pg) => {
        const { rows: [v] } = await pg.query('SELECT version() AS version, current_user AS username')
        const { rows: [r] } = await pg.query(
          'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user'
        )
        const { rows: [d] } = await pg.query("SELECT count(*)::int AS tenant_databases FROM pg_database WHERE datname LIKE 'lg\\_%'")
        return { ...v, ...r, ...d }
      })
      const ready = info.rolsuper || (info.rolcreatedb && info.rolcreaterole)
      return res.json({
        ok: true,
        ready,
        latency_ms: Date.now() - started,
        username: info.username,
        server_version: info.version,
        privileges: { superuser: info.rolsuper, createdb: info.rolcreatedb, createrole: info.rolcreaterole },
        tenant_databases: info.tenant_databases,
        warning: ready ? null : 'Role provisioner butuh CREATEDB dan CREATEROLE',
      })
    } catch (err) {
      return res.json({
        ok: false, latency_ms: Date.now() - started, error: err.message, code: err.code || null,
      })
    }
  })

  return app
}

module.exports = { create }

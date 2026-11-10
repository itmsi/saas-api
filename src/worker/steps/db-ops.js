/** Operasi DDL cluster yang dipakai beberapa step (semua idempotent). */
const { withAdmin, ident } = require('../../lib/pg-admin')

const terminateConnections = (pg, dbName) => pg.query(
  'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
  [dbName]
)

const dropDatabase = (ctx) => withAdmin(ctx.cluster, async (pg) => {
  const dbName = ctx.tenant.db_name
  const exists = (await pg.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])).rowCount > 0
  if (!exists) return { message: `Database ${dbName} tidak ada (lewati)` }
  await pg.query(`REVOKE CONNECT ON DATABASE ${ident(dbName)} FROM PUBLIC`).catch(() => {})
  await terminateConnections(pg, dbName)
  await pg.query(`DROP DATABASE IF EXISTS ${ident(dbName)}`)
  return { message: `Database ${dbName} dihapus` }
})

const dropRoles = (ctx) => withAdmin(ctx.cluster, async (pg) => {
  const names = [ctx.tenant.db_app_username, ctx.tenant.db_owner_username]
  const dropped = []
  // eslint-disable-next-line no-restricted-syntax
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    const exists = (await pg.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name])).rowCount > 0
    if (exists) {
      // eslint-disable-next-line no-await-in-loop
      await pg.query(`DROP ROLE IF EXISTS ${ident(name)}`)
      dropped.push(name)
    }
  }
  return { message: dropped.length ? `Role dihapus: ${dropped.join(', ')}` : 'Role tidak ada (lewati)' }
})

module.exports = { dropDatabase, dropRoles, terminateConnections }

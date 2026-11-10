const config = require('../../config')
const { withAdmin, ident, literal } = require('../../lib/pg-admin')
const { dropRoles } = require('./db-ops')

/**
 * Step 1: role owner (DDL) & role app (DML).
 * Idempotent: jika role sudah ada -> ALTER ROLE ... PASSWORD.
 */
module.exports = {
  name: 'create_roles',
  executor: 'saas-worker',

  run: (ctx) => withAdmin(ctx.cluster, async (pg) => {
    const t = ctx.tenant
    const roles = [
      { name: t.db_owner_username, password: ctx.secrets.ownerPassword(), extra: '' },
      { name: t.db_app_username, password: ctx.secrets.appPassword(), extra: ` CONNECTION LIMIT ${Number(config.tenantDb.appConnectionLimit)}` },
    ]
    const notes = []
    // eslint-disable-next-line no-restricted-syntax
    for (const r of roles) {
      // eslint-disable-next-line no-await-in-loop
      const exists = (await pg.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [r.name])).rowCount > 0
      if (exists) {
        // eslint-disable-next-line no-await-in-loop
        await pg.query(`ALTER ROLE ${ident(r.name)} WITH LOGIN PASSWORD ${literal(r.password)}`)
        notes.push(`${r.name} sudah ada, password diperbarui`)
      } else {
        // eslint-disable-next-line no-await-in-loop
        await pg.query(`CREATE ROLE ${ident(r.name)} LOGIN PASSWORD ${literal(r.password)} NOSUPERUSER NOCREATEDB NOCREATEROLE${r.extra}`)
        notes.push(`${r.name} dibuat`)
      }
    }
    // Provisioner perlu menjadi anggota role owner agar bisa CREATE DATABASE ... OWNER
    await pg.query(`GRANT ${ident(t.db_owner_username)} TO CURRENT_USER`)
    return { message: notes.join('; ') }
  }),

  compensate: dropRoles,
}

const { withAdmin, ident } = require('../../lib/pg-admin')

/**
 * Step 3: hak akses. Aman diulang. Tidak ada compensate (ikut terhapus saat drop DB).
 */
module.exports = {
  name: 'grant_privileges',
  executor: 'saas-worker',

  run: async (ctx) => {
    const t = ctx.tenant
    const dbName = ident(t.db_name)
    const owner = ident(t.db_owner_username)
    const app = ident(t.db_app_username)

    await withAdmin(ctx.cluster, async (pg) => {
      await pg.query(`REVOKE ALL ON DATABASE ${dbName} FROM PUBLIC`)
      await pg.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${app}`)
    })

    await withAdmin(ctx.cluster, async (pg) => {
      await pg.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
      await pg.query(`ALTER SCHEMA public OWNER TO ${owner}`)
      await pg.query(`GRANT USAGE ON SCHEMA public TO ${app}`)
      await pg.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`)
      await pg.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${app}`)
    }, { database: t.db_name })

    return { message: `Privilege ${t.db_app_username} (DML) & ${t.db_owner_username} (owner) diterapkan` }
  },
}

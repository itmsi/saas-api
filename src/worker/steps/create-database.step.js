const { withAdmin, ident } = require('../../lib/pg-admin')
const { dropDatabase } = require('./db-ops')

/** Step 2: CREATE DATABASE lg_x OWNER lg_x_owner */
module.exports = {
  name: 'create_database',
  executor: 'saas-worker',

  run: (ctx) => withAdmin(ctx.cluster, async (pg) => {
    const { db_name: dbName, db_owner_username: owner } = ctx.tenant
    const exists = (await pg.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])).rowCount > 0
    if (exists) return { message: `Database ${dbName} sudah ada` }
    await pg.query(`CREATE DATABASE ${ident(dbName)} OWNER ${ident(owner)} ENCODING 'UTF8' TEMPLATE template0`)
    return { message: `Database ${dbName} dibuat (owner ${owner})` }
  }),

  compensate: dropDatabase,
}

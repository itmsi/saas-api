const db = require('../../database')
const { stamp } = require('../../database')
const cache = require('../../lib/cache')

/** Step 7: client active, simpan schema_version & provisioned_at, hapus cache */
module.exports = {
  name: 'finalize',
  executor: 'saas-worker',

  run: async (ctx) => {
    await db.transaction(async (trx) => {
      await trx('clients').where({ id: ctx.client.id }).update(stamp.update({ status: 'active', status_reason: null }))
      const data = { provisioned_at: trx.fn.now() }
      if (ctx.state.schemaVersion) data.schema_version = ctx.state.schemaVersion
      await trx('tenant_db_configs').where({ id: ctx.tenant.id }).update(stamp.update(data))
    })
    await cache.invalidateTenant({ client_id: ctx.client.id, client_code: ctx.client.client_code }, 'provisioned')
    return { message: `Client ${ctx.client.client_code} active` }
  },

  compensate: async (ctx) => {
    await db('clients').where({ id: ctx.client.id }).update(stamp.update({ status: 'provisioning_failed' }))
    return { message: 'clients.status = provisioning_failed' }
  },
}

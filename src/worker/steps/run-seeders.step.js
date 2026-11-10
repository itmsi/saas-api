const logisticsApi = require('../../clients/logistics-api.client')
const { unwrap } = require('./run-migrations.step')

/** Step 5: POST logistics-api /internal/tenants/:id/seed */
module.exports = {
  name: 'run_seeders',
  executor: 'logistics-api',

  run: async (ctx) => {
    const res = await logisticsApi.seed(ctx.client.id, ctx.httpOptions('run_seeders'))
    const data = unwrap(res.body) || {}
    return {
      message: `Seeder: ${Array.isArray(data.seeded) ? data.seeded.join(', ') : 'ok'}`,
      http_status: res.status,
      response_body: res.body,
    }
  },
}

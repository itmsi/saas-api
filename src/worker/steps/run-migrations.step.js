const logisticsApi = require('../../clients/logistics-api.client')

const unwrap = (body) => (body && typeof body === 'object' && 'data' in body ? body.data : body)

/** Step 4: POST logistics-api /internal/tenants/:id/migrate */
module.exports = {
  name: 'run_migrations',
  executor: 'logistics-api',

  run: async (ctx) => {
    const target = ctx.job.params?.target || 'latest'
    const res = await logisticsApi.migrate(ctx.client.id, { target, ...ctx.httpOptions('run_migrations') })
    const data = unwrap(res.body) || {}
    if (data.schema_version) ctx.state.schemaVersion = data.schema_version
    const applied = Array.isArray(data.applied) ? data.applied.length : 0
    return {
      message: `${applied} migrasi dijalankan, schema_version ${data.schema_version || '-'}`,
      http_status: res.status,
      response_body: res.body,
    }
  },
}
module.exports.unwrap = unwrap

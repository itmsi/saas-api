const logisticsApi = require('../../clients/logistics-api.client')
const { permanent } = require('../../lib/errors')
const { unwrap } = require('./run-migrations.step')

/** Step 6: GET logistics-api /internal/tenants/:id/verify (read-only) */
module.exports = {
  name: 'verify',
  executor: 'logistics-api',

  run: async (ctx) => {
    const res = await logisticsApi.verify(ctx.client.id, ctx.httpOptions('verify'))
    const data = unwrap(res.body) || {}
    if (data.ok !== true) {
      throw permanent('Verifikasi tenant gagal', {
        code: 'VERIFY_FAILED', httpStatus: res.status, responseBody: res.body, detail: data.checks,
      })
    }
    return { message: 'Verifikasi OK', http_status: res.status, response_body: res.body }
  },
}

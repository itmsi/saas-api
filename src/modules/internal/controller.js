const { ok, wrapAll } = require('../../utils/response')
const service = require('./service')

const send = (res, { tenant, cache }) => {
  if (cache === 'bypass') res.setHeader('Cache-Control', 'no-store') // berisi kredensial owner
  return ok(res, tenant, { meta: { cache } })
}

const resolveByCode = async (req, res) => send(res, await service.resolve(
  { code: req.valid.params.client_code },
  req.valid.query.scope,
  req.internalScope,
))

const resolveById = async (req, res) => send(res, await service.resolve(
  { id: req.valid.params.client_id },
  req.valid.query.scope,
  req.internalScope,
))

module.exports = wrapAll({ resolveByCode, resolveById })

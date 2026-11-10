const { ok, created, wrapAll } = require('../../utils/response')
const { ctxOf } = require('../../utils/context')
const service = require('./service')

const listByClient = async (req, res) => ok(res, await service.listByClient(req.valid.params.id))

const create = async (req, res) => {
  const { row, cancelledIds } = await service.create(req.valid.params.id, req.body, ctxOf(req))
  return created(res, row, { meta: { cancelled_subscription_ids: cancelledIds } })
}

const update = async (req, res) => ok(res, await service.update(req.valid.params.id, req.body, ctxOf(req)))

module.exports = wrapAll({ listByClient, create, update })

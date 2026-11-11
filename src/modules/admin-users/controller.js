const { ok, created, wrapAll } = require('../../utils/response')
const { ctxOf } = require('../../utils/context')
const service = require('./service')

const list = async (req, res) => {
  const { rows, meta } = await service.list(req.body)
  return ok(res, rows, { meta })
}

const detail = async (req, res) => ok(res, await service.detail(req.valid.params.id))

const create = async (req, res) => created(res, await service.create(req.body, ctxOf(req)))

const update = async (req, res) => ok(res, await service.update(req.valid.params.id, req.body, ctxOf(req)))

const resetPassword = async (req, res) => ok(res, await service.resetPassword(req.valid.params.id, req.body, ctxOf(req)))

const remove = async (req, res) => ok(res, await service.remove(req.valid.params.id, ctxOf(req)))

module.exports = wrapAll({
  list, detail, create, update, resetPassword, remove,
})

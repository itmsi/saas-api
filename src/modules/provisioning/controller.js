const { ok, accepted, wrapAll } = require('../../utils/response')
const { ctxOf } = require('../../utils/context')
const service = require('./service')

const list = async (req, res) => {
  const { rows, meta } = await service.list(req.body)
  return ok(res, rows, { meta })
}

const detail = async (req, res) => ok(res, await service.detail(req.valid.params.id))

const retry = async (req, res) => accepted(res, await service.retry(req.valid.params.id, ctxOf(req)))

const cleanup = async (req, res) => accepted(res, await service.cleanup(req.valid.params.id, { rerun: false }, ctxOf(req)))

const cleanupAndRerun = async (req, res) => accepted(res, await service.cleanup(req.valid.params.id, { rerun: true }, ctxOf(req)))

module.exports = wrapAll({
  list, detail, retry, cleanup, cleanupAndRerun,
})

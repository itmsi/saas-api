const { ok, accepted, wrapAll } = require('../../utils/response')
const { ctxOf } = require('../../utils/context')
const service = require('./service')

const status = async (req, res) => ok(res, await service.status())

const rollout = async (req, res) => accepted(res, await service.rollout(req.body, ctxOf(req)))

const listRollouts = async (req, res) => {
  const { rows, meta } = await service.listRollouts(req.valid.query)
  return ok(res, rows, { meta })
}

const rolloutDetail = async (req, res) => ok(res, await service.rolloutDetail(req.valid.params.id))

const retryFailed = async (req, res) => accepted(res, await service.retryFailed(req.valid.params.id, ctxOf(req)))

module.exports = wrapAll({
  status, rollout, listRollouts, rolloutDetail, retryFailed,
})

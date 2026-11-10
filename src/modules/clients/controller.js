const { ok, accepted, wrapAll } = require('../../utils/response')
const { ctxOf } = require('../../utils/context')
const service = require('./service')

const list = async (req, res) => {
  const { rows, meta } = await service.list(req.valid.query)
  return ok(res, rows, { meta })
}

const create = async (req, res) => accepted(res, await service.create(req.body, ctxOf(req)))

const detail = async (req, res) => ok(res, await service.detail(req.valid.params.id))

const update = async (req, res) => ok(res, await service.update(req.valid.params.id, req.body, ctxOf(req)))

const updateStatus = async (req, res) => ok(res, await service.updateStatus(req.valid.params.id, req.body, ctxOf(req)))

const deprovision = async (req, res) => accepted(res, await service.deprovision(req.valid.params.id, req.body, ctxOf(req)))

const dbConfig = async (req, res) => ok(res, await service.dbConfig(req.valid.params.id))

const rotateDbPassword = async (req, res) => accepted(res, await service.rotateDbPassword(req.valid.params.id, ctxOf(req)))

const revealSystemUser = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  return ok(res, await service.revealSystemUser(req.valid.params.id, ctxOf(req)))
}

const resetSystemUser = async (req, res) => accepted(res, await service.resetSystemUser(req.valid.params.id, ctxOf(req)))

const jobs = async (req, res) => {
  const { rows, meta } = await service.jobs(req.valid.params.id, req.valid.query)
  return ok(res, rows, { meta })
}

const auditLogs = async (req, res) => {
  const { rows, meta } = await service.auditLogs(req.valid.params.id, req.valid.query)
  return ok(res, rows, { meta })
}

module.exports = wrapAll({
  list,
  create,
  detail,
  update,
  updateStatus,
  deprovision,
  dbConfig,
  rotateDbPassword,
  revealSystemUser,
  resetSystemUser,
  jobs,
  auditLogs,
})

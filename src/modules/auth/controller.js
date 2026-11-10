const { ok, wrapAll } = require('../../utils/response')
const { ctxOf } = require('../../utils/context')
const service = require('./service')

const login = async (req, res) => ok(res, await service.login(req.body, ctxOf(req)))

const refresh = async (req, res) => ok(res, await service.refresh(req.body, ctxOf(req)))

const logout = async (req, res) => ok(res, await service.logout(req.body, ctxOf(req)))

const me = async (req, res) => ok(res, await service.me(req.actorId))

module.exports = wrapAll({
  login, refresh, logout, me,
})

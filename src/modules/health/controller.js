const { wrapAll } = require('../../utils/response')
const service = require('./service')

// Format sengaja tanpa meta: dipakai healthcheck Docker / load balancer
const liveness = async (req, res) => res.json({ success: true, data: service.liveness() })

const readiness = async (req, res) => {
  const { healthy, data } = await service.readiness()
  return res.status(healthy ? 200 : 503).json({ success: healthy, data })
}

module.exports = wrapAll({ liveness, readiness })

const { Joi, uuid } = require('../../utils/validation')

const byCode = Joi.object({
  client_code: Joi.string().pattern(/^[a-z0-9-]{3,30}$/).required(),
})

const byId = Joi.object({
  client_id: uuid.required(),
})

const resolveQuery = Joi.object({
  scope: Joi.string().valid('default', 'provisioning').default('default'),
})

module.exports = { byCode, byId, resolveQuery }

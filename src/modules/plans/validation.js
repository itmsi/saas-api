const { Joi, idParam } = require('../../utils/validation')

const fields = {
  name: Joi.string().max(100),
  max_users: Joi.number().integer().min(0).allow(null),
  max_shipments_per_month: Joi.number().integer().min(0).allow(null),
  features: Joi.object().unknown(true),
  price_monthly: Joi.number().min(0).precision(2),
  is_active: Joi.boolean(),
}

const list = Joi.object({ is_active: Joi.boolean() })

const create = Joi.object({
  code: Joi.string().pattern(/^[a-z0-9_-]{2,50}$/).required(),
  ...fields,
  name: fields.name.required(),
})

const update = Joi.object(fields).min(1)

module.exports = {
  idParam, list, create, update,
}

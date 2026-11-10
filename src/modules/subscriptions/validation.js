const { Joi, idParam } = require('../../utils/validation')

const STATUSES = ['trial', 'active', 'past_due', 'expired', 'cancelled']

const create = Joi.object({
  plan_code: Joi.string().max(50).required(),
  status: Joi.string().valid('trial', 'active').default('active'),
  start_date: Joi.date().iso().default(() => new Date()),
  end_date: Joi.date().iso().allow(null),
  trial_end_date: Joi.date().iso().allow(null),
  auto_renew: Joi.boolean().default(true),
  notes: Joi.string().max(2000).allow(null, ''),
})

const update = Joi.object({
  status: Joi.string().valid(...STATUSES),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso().allow(null),
  trial_end_date: Joi.date().iso().allow(null),
  auto_renew: Joi.boolean(),
  notes: Joi.string().max(2000).allow(null, ''),
}).min(1)

module.exports = { idParam, create, update }

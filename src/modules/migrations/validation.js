const {
  Joi, uuid, idParam, pagination, sortBy,
} = require('../../utils/validation')

const rollout = Joi.object({
  client_ids: Joi.array().items(uuid).unique().default([]), // kosong = semua tenant active
  target: Joi.string().max(100).default('latest'),
})

const list = Joi.object({
  ...pagination,
  ...sortBy,
  status: Joi.string().valid('running', 'completed', 'completed_with_errors').empty(''),
})

module.exports = { idParam, rollout, list }

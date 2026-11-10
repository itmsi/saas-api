const {
  Joi, uuid, idParam, pagination,
} = require('../../utils/validation')

const rollout = Joi.object({
  client_ids: Joi.array().items(uuid).unique().default([]), // kosong = semua tenant active
  target: Joi.string().max(100).default('latest'),
})

const list = Joi.object({
  ...pagination,
  status: Joi.string().valid('running', 'completed', 'completed_with_errors'),
})

module.exports = { idParam, rollout, list }

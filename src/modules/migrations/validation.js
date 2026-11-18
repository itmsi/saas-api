const {
  Joi, uuid, idParam, pagination, sortBy, listSchema,
} = require('../../utils/validation')

const rollout = Joi.object({
  client_ids: Joi.array().items(uuid).unique().default([]), // kosong = semua tenant active
  target: Joi.string().max(100).default('latest'),
})

const list = listSchema({
  ...pagination,
  ...sortBy,
  status: Joi.string().valid('running', 'completed', 'completed_with_errors').empty(''),
})

module.exports = { idParam, rollout, list }

const { Joi, idParam, pagination } = require('../../utils/validation')

const ROLES = ['superadmin', 'operator', 'viewer']
const email = Joi.string().email({ tlds: { allow: false } }).max(150)

const list = Joi.object({
  ...pagination,
  search: Joi.string().max(100).allow(''),
  role: Joi.string().valid(...ROLES).empty(''),
  is_active: Joi.boolean().empty(''),
})

const create = Joi.object({
  email: email.required(),
  name: Joi.string().max(150).required(),
  password: Joi.string().min(10).max(200).required(),
  role: Joi.string().valid(...ROLES).default('operator'),
})

const update = Joi.object({
  email,
  name: Joi.string().max(150),
  role: Joi.string().valid(...ROLES),
  is_active: Joi.boolean(),
}).min(1)

const resetPassword = Joi.object({
  password: Joi.string().min(10).max(200).required(),
})

module.exports = {
  ROLES, idParam, list, create, update, resetPassword,
}

const { Joi } = require('../../utils/validation')

const login = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(150).required(),
  password: Joi.string().max(200).required(),
})

const refresh = Joi.object({
  refresh_token: Joi.string().max(200).required(),
})

module.exports = { login, refresh }

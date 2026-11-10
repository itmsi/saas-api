/** Potongan skema Joi yang dipakai banyak modul */
const Joi = require('joi')

const uuid = Joi.string().guid()
const idParam = Joi.object({ id: uuid.required() })
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
}

module.exports = {
  Joi, uuid, idParam, pagination
}

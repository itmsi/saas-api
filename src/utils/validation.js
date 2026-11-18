/** Potongan skema Joi yang dipakai banyak modul */
const Joi = require('joi')

const uuid = Joi.string().guid()
const idParam = Joi.object({ id: uuid.required() })
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
}
/** Arah urutan list: ASC / DESC (case-insensitive), default DESC */
const sortBy = {
  sort_by: Joi.string().trim().uppercase().valid('ASC', 'DESC')
    .default('DESC'),
}

module.exports = {
  Joi, uuid, idParam, pagination, sortBy,
}

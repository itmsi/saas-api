/** Potongan skema Joi yang dipakai banyak modul */
const BaseJoi = require('joi')

/** Nilai yang dianggap "tidak diisi" di payload list: null, NaN, '', 'nan', 'null', 'undefined' */
const EMPTY_STRINGS = ['', 'nan', 'null', 'undefined']
const isEmptyValue = (v) => v === null
  || (typeof v === 'number' && Number.isNaN(v))
  || (typeof v === 'string' && EMPTY_STRINGS.includes(v.trim().toLowerCase()))

/** Buang field kosong (dan elemen kosong di array) supaya dianggap tidak dikirim -> default berlaku */
const stripEmpty = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.entries(value).reduce((acc, [key, v]) => {
    if (isEmptyValue(v)) return acc
    if (Array.isArray(v)) {
      const items = v.filter((item) => !isEmptyValue(item))
      if (items.length) acc[key] = items
      return acc
    }
    acc[key] = v
    return acc
  }, {})
}

const Joi = BaseJoi.extend({
  type: 'listObject',
  base: BaseJoi.object(),
  prepare: (value) => ({ value: stripEmpty(value) }),
})

/**
 * Skema payload endpoint list. Field berisi '', null, NaN, 'nan', 'null', 'undefined'
 * diabaikan (bukan error validasi), lalu default (page, limit, sort_by, ...) berlaku.
 */
const listSchema = (keys) => Joi.listObject(keys)

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
  Joi, uuid, idParam, pagination, sortBy, listSchema, isEmptyValue,
}

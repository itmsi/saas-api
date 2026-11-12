const { Joi, idParam } = require('../../utils/validation')

const STATUSES = ['active', 'full', 'maintenance', 'disabled']

const fields = {
  name: Joi.string().max(100),
  host: Joi.string().hostname().max(255),
  port: Joi.number().integer().min(1).max(65535),
  pooler_host: Joi.string().hostname().max(255).allow(null),
  pooler_port: Joi.number().integer().min(1).max(65535)
    .allow(null),
  admin_secret_ref: Joi.string().pattern(/^[A-Z][A-Z0-9_]{1,200}$/)
    .messages({ 'string.pattern.base': 'admin_secret_ref harus huruf besar/angka/underscore, mis. CLUSTER_PG_PROD_01' }),
  max_tenants: Joi.number().integer().min(1),
  status: Joi.string().valid(...STATUSES),
  // true = jadi cluster default POST /clients (default lama otomatis dilepas)
  is_default: Joi.boolean(),
}

const list = Joi.object({ status: Joi.string().valid(...STATUSES).empty('') })

const create = Joi.object({
  ...fields,
  name: fields.name.required(),
  host: fields.host.required(),
  admin_secret_ref: fields.admin_secret_ref.required(),
})

const update = Joi.object(fields).min(1)

module.exports = {
  idParam, list, create, update,
}

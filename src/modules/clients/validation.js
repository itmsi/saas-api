const {
  Joi, uuid, idParam, pagination,
} = require('../../utils/validation')
const { JOB_TYPES } = require('../../lib/job-plans')

const CLIENT_STATUSES = ['provisioning', 'provisioning_failed', 'active', 'suspended', 'deprovisioning', 'deleted']
const JOB_STATUSES = ['queued', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'rollback_failed']

const profile = {
  name: Joi.string().max(150),
  legal_name: Joi.string().max(200).allow(null, ''),
  email: Joi.string().email({ tlds: { allow: false } }).max(150).allow(null, ''),
  phone: Joi.string().max(30).allow(null, ''),
  address: Joi.string().max(2000).allow(null, ''),
  npwp: Joi.string().max(30).allow(null, ''),
  settings: Joi.object().unknown(true),
}

const list = Joi.object({
  ...pagination,
  status: Joi.alternatives(
    Joi.string().valid(...CLIENT_STATUSES),
    Joi.array().items(Joi.string().valid(...CLIENT_STATUSES)),
  ),
  search: Joi.string().max(100).allow(''),
  cluster_id: uuid,
  plan_code: Joi.string().max(50),
  sort: Joi.string().valid('created_at', 'client_code', 'name', 'status').default('created_at'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
})

const create = Joi.object({
  client_code: Joi.string().pattern(/^[a-z0-9-]{3,30}$/).required()
    .messages({ 'string.pattern.base': 'client_code hanya huruf kecil, angka, dan tanda -, 3-30 karakter' }),
  ...profile,
  name: profile.name.required(),
  plan_code: Joi.string().max(50).required(),
  subscription: Joi.object({
    status: Joi.string().valid('trial', 'active').default('trial'),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso().allow(null),
    trial_end_date: Joi.date().iso().allow(null),
    auto_renew: Joi.boolean(),
    notes: Joi.string().max(2000).allow(null, ''),
  }).default({}),
  cluster_id: uuid.allow(null),
  pool_max: Joi.number().integer().min(1).max(100),
})

const update = Joi.object(profile).min(1)

const updateStatus = Joi.object({
  status: Joi.string().valid('active', 'suspended').required(),
  reason: Joi.string().max(2000).allow(null, ''),
})

const deprovision = Joi.object({
  confirm_client_code: Joi.string().required(),
  backup: Joi.boolean().default(true),
})

const jobs = Joi.object({
  ...pagination,
  type: Joi.string().valid(...JOB_TYPES),
  status: Joi.string().valid(...JOB_STATUSES),
})

const auditLogs = Joi.object({ ...pagination })

module.exports = {
  idParam, list, create, update, updateStatus, deprovision, jobs, auditLogs,
}

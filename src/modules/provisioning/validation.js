const {
  Joi, uuid, idParam, pagination,
} = require('../../utils/validation')
const { JOB_TYPES } = require('../../lib/job-plans')

const JOB_STATUSES = ['queued', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'rollback_failed']

const list = Joi.object({
  ...pagination,
  status: Joi.string().valid(...JOB_STATUSES),
  type: Joi.string().valid(...JOB_TYPES),
  client_id: uuid,
  rollout_id: uuid,
})

module.exports = { idParam, list }

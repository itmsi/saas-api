const {
  Joi, uuid, idParam, pagination,
} = require('../../utils/validation')
const { JOB_TYPES } = require('../../lib/job-plans')

const JOB_STATUSES = ['queued', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'rollback_failed']

const list = Joi.object({
  ...pagination,
  status: Joi.string().valid(...JOB_STATUSES).empty(''),
  type: Joi.string().valid(...JOB_TYPES).empty(''),
  client_id: uuid.empty(''),
  rollout_id: uuid.empty(''),
})

module.exports = { idParam, list }

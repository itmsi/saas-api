/**
 * Swagger API Path Definitions for Provisioning Jobs Module
 */
const {
  ref, response, param, dataResponse, errorBody, bearer,
} = require('../helpers')

const tags = ['Provisioning Jobs']
const notRetryable = errorBody('Job tidak bisa diulang', 'JOB_NOT_RETRYABLE', 'Job ini tidak bisa diulang pada status saat ini.', 409, { status: 'success' })

const provisioningPaths = {
  '/provisioning-jobs': {
    get: {
      tags,
      summary: 'List job',
      description: '**Role:** semua admin',
      security: bearer,
      parameters: [
        param('PageParam'),
        param('LimitParam'),
        {
          name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['queued', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'rollback_failed'] },
        },
        {
          name: 'type', in: 'query', required: false, schema: { type: 'string', enum: ['provision', 'migrate', 'cleanup', 'deprovision', 'rotate_password', 'reset_system_user'] },
        },
        {
          name: 'client_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'rollout_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('ProvisioningJob') }, { paginated: true }),
        401: response('Unauthorized'),
      },
    },
  },
  '/provisioning-jobs/{id}': {
    get: {
      tags,
      summary: 'Detail job',
      description: '**Role:** semua admin. Semua step beserta status, attempt, error, `http_status` & `response_body` dari logistics-api.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('OK', ref('ProvisioningJobDetail')),
        401: response('Unauthorized'),
        404: response('NotFound'),
      },
    },
  },
  '/provisioning-jobs/{id}/retry': {
    post: {
      tags,
      summary: 'Retry job gagal',
      description: '**Role:** superadmin, operator. Membuat job baru dengan `parent_job_id` = job ini.\n\n'
        + '| Job lama | Job baru |\n|---|---|\n'
        + '| provision `failed` (ROLLBACK_ON_FAILURE=false) | mode `resume`: step yang sudah sukses di-skip |\n'
        + '| provision `rolled_back` | mode `full`: provisioning ulang dari awal |\n'
        + '| provision `rollback_failed` | ditolak, pakai `cleanup-and-rerun` |\n'
        + '| tipe lain `failed` | job baru dengan params sama |\n\n'
        + 'Job yang sudah pernah di-retry tidak bisa di-retry lagi (retry job terbarunya).',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        202: dataResponse('Job retry dijadwalkan', ref('JobRetryResponse')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: notRetryable,
      },
    },
  },
  '/provisioning-jobs/{id}/cleanup-and-rerun': {
    post: {
      tags,
      summary: 'Paksa cleanup lalu provisioning ulang',
      description: '**Role:** superadmin, operator. Untuk job provision yang gagal (terutama `rollback_failed`). Job baru diawali step `cleanup_existing` (drop DB & role) lalu 7 step provisioning.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        202: dataResponse('Job dijadwalkan', ref('JobRetryResponse')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: notRetryable,
      },
    },
  },
  '/provisioning-jobs/{id}/cleanup': {
    post: {
      tags,
      summary: 'Cleanup saja',
      description: '**Role:** superadmin, operator. Job `cleanup`: drop database & role tenant dari job provision yang gagal. Client tetap `provisioning_failed`.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        202: dataResponse('Job dijadwalkan', ref('JobRetryResponse')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: notRetryable,
      },
    },
  },
}

module.exports = provisioningPaths

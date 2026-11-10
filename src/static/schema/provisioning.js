/**
 * Swagger Schema Definitions for Provisioning Jobs Module
 */

const jobType = { type: 'string', enum: ['provision', 'migrate', 'cleanup', 'deprovision', 'rotate_password', 'reset_system_user'], example: 'provision' }
const jobStatus = { type: 'string', enum: ['queued', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'rollback_failed'], example: 'rolled_back' }

const provisioningSchemas = {
  ProvisioningJob: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '17461926-9506-4336-a0db-d879e1b3113e' },
          client_id: { type: 'string', format: 'uuid' },
          client_code: { type: 'string', description: 'Hanya di list', example: 'ogo' },
          client_name: { type: 'string', description: 'Hanya di list', example: 'OGO Logistics' },
          type: jobType,
          status: jobStatus,
          mode: {
            type: 'string', enum: ['full', 'resume'], description: 'resume = lanjut dari step gagal', example: 'full'
          },
          parent_job_id: {
            type: 'string', format: 'uuid', nullable: true, description: 'Job lama yang di-retry'
          },
          rollout_id: { type: 'string', format: 'uuid', nullable: true },
          params: { type: 'object', additionalProperties: true, example: {} },
          attempt: { type: 'integer', example: 1 },
          failed_step: { type: 'string', nullable: true, example: 'run_migrations' },
          error_message: { type: 'string', nullable: true, example: 'relation "trips" already exists' },
          error_detail: {
            type: 'object',
            nullable: true,
            example: {
              step: 'run_migrations', code: 'MIGRATION_FAILED', transient: false, http_status: 500
            }
          },
          requested_by: { type: 'string', format: 'uuid', nullable: true },
          worker_id: { type: 'string', nullable: true, example: 'saas-worker-1' },
          queued_at: { type: 'string', format: 'date-time' },
          started_at: { type: 'string', format: 'date-time', nullable: true },
          finished_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  ProvisioningStep: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          job_id: { type: 'string', format: 'uuid' },
          step_order: { type: 'integer', example: 4 },
          step_name: {
            type: 'string',
            description: 'provision: create_roles, create_database, grant_privileges, run_migrations, run_seeders, verify, finalize',
            example: 'run_migrations',
          },
          executor: { type: 'string', enum: ['saas-worker', 'logistics-api'], example: 'logistics-api' },
          status: {
            type: 'string', enum: ['pending', 'running', 'success', 'failed', 'skipped', 'compensated', 'compensate_failed'], example: 'failed',
          },
          attempt: { type: 'integer', description: 'Bertambah setiap retry transient', example: 1 },
          message: { type: 'string', nullable: true, example: '1 migrasi dijalankan, schema_version 20261110_001' },
          error_message: { type: 'string', nullable: true, example: 'relation "trips" already exists' },
          error_detail: { type: 'object', nullable: true },
          http_status: {
            type: 'integer', nullable: true, description: 'Untuk step yang memanggil logistics-api', example: 500
          },
          response_body: { type: 'object', nullable: true, description: 'Respons logistics-api (maks 10 KB, tanpa data rahasia)' },
          started_at: { type: 'string', format: 'date-time', nullable: true },
          finished_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  ProvisioningJobDetail: {
    allOf: [
      { $ref: '#/components/schemas/ProvisioningJob' },
      {
        type: 'object',
        properties: {
          client: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              client_code: { type: 'string', example: 'ogo' },
              name: { type: 'string', example: 'OGO Logistics' },
              status: { type: 'string', example: 'provisioning_failed' },
            },
          },
          steps: { type: 'array', items: { $ref: '#/components/schemas/ProvisioningStep' } },
        },
      },
    ],
  },
  JobRetryResponse: {
    type: 'object',
    properties: {
      job_id: { type: 'string', format: 'uuid', example: '9339a6f4-1556-4387-ba03-7bd3c1a139d8' },
      parent_job_id: { type: 'string', format: 'uuid', example: '17461926-9506-4336-a0db-d879e1b3113e' },
      type: jobType,
      mode: { type: 'string', enum: ['full', 'resume'], example: 'full' },
      status: { type: 'string', example: 'queued' },
    },
  },
}

module.exports = provisioningSchemas

/**
 * Swagger Schema Definitions for Migration Rollout Module
 */

const tenantJob = {
  type: 'object',
  properties: {
    client_id: { type: 'string', format: 'uuid' },
    client_code: { type: 'string', example: 'ogo' },
    job_id: { type: 'string', format: 'uuid' },
  },
}

const migrationSchemas = {
  MigrationStatus: {
    type: 'object',
    properties: {
      logistics_api: {
        type: 'object', additionalProperties: true, description: 'Respons GET logistics-api /internal/migrations/status (atau { error } jika gagal)', example: { latest_version: '20261110_002' },
      },
      tenants_by_schema_version: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            schema_version: { type: 'string', nullable: true, example: '20261110_001' },
            tenants: { type: 'integer', example: 12 },
          },
        },
      },
    },
  },
  RolloutRequest: {
    type: 'object',
    properties: {
      client_ids: {
        type: 'array', items: { type: 'string', format: 'uuid' }, default: [], description: 'Kosong = semua tenant active',
      },
      target: { type: 'string', default: 'latest', example: 'latest' },
    },
  },
  RolloutAccepted: {
    type: 'object',
    properties: {
      rollout_id: { type: 'string', format: 'uuid' },
      target_version: { type: 'string', example: '20261110_002' },
      total_tenants: { type: 'integer', example: 12 },
      jobs: { type: 'array', items: tenantJob },
      skipped: {
        type: 'array',
        description: 'Tenant yang sedang punya job aktif',
        items: {
          type: 'object',
          properties: {
            client_id: { type: 'string', format: 'uuid' },
            client_code: { type: 'string' },
            reason: { type: 'string', example: 'job_active' },
            job_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
  },
  Rollout: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          target_version: { type: 'string', example: '20261110_002' },
          total_tenants: { type: 'integer', example: 12 },
          success_count: { type: 'integer', example: 11 },
          failed_count: { type: 'integer', example: 1 },
          status: { type: 'string', enum: ['running', 'completed', 'completed_with_errors'], example: 'completed_with_errors' },
          requested_by: { type: 'string', format: 'uuid', nullable: true },
          finished_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  RolloutDetail: {
    allOf: [
      { $ref: '#/components/schemas/Rollout' },
      {
        type: 'object',
        properties: {
          progress: { type: 'object', additionalProperties: { type: 'integer' }, example: { success: 11, failed: 1 } },
          failed: { type: 'array', items: { $ref: '#/components/schemas/RolloutJob' } },
          jobs: { type: 'array', items: { $ref: '#/components/schemas/RolloutJob' } },
        },
      },
    ],
  },
  RolloutJob: {
    type: 'object',
    properties: {
      job_id: { type: 'string', format: 'uuid' },
      client_id: { type: 'string', format: 'uuid' },
      client_code: { type: 'string', example: 'ogo' },
      status: { type: 'string', example: 'failed' },
      error_message: { type: 'string', nullable: true },
      error_detail: { type: 'object', nullable: true },
      parent_job_id: { type: 'string', format: 'uuid', nullable: true },
      queued_at: { type: 'string', format: 'date-time' },
      finished_at: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  RolloutRetryResponse: {
    type: 'object',
    properties: {
      rollout_id: { type: 'string', format: 'uuid' },
      jobs: { type: 'array', items: tenantJob },
      skipped: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
}

module.exports = migrationSchemas

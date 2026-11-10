/**
 * Swagger Schema Definitions for Clients Module
 */

const clientStatus = {
  type: 'string',
  enum: ['provisioning', 'provisioning_failed', 'active', 'suspended', 'deprovisioning', 'deleted'],
  example: 'active',
}

const profile = {
  name: { type: 'string', maxLength: 150, example: 'OGO Logistics' },
  legal_name: { type: 'string', nullable: true, example: 'PT Owngo Logistics Indonesia' },
  email: {
    type: 'string', format: 'email', nullable: true, example: 'admin@ogo.co.id'
  },
  phone: { type: 'string', nullable: true, example: '0812xxxx' },
  address: { type: 'string', nullable: true, example: 'Jl. Raya Bekasi No. 1, Jakarta Timur' },
  npwp: { type: 'string', nullable: true, example: '01.234.567.8-901.000' },
  settings: { type: 'object', additionalProperties: true, example: { timezone: 'Asia/Jakarta' } },
}

const clientSchemas = {
  Client: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '8b9aa967-1dd5-488b-98f0-d7753afc806e' },
          client_code: { type: 'string', example: 'ogo' },
          ...profile,
          status: clientStatus,
          status_reason: { type: 'string', nullable: true, example: null },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  ClientListItem: {
    allOf: [
      { $ref: '#/components/schemas/Client' },
      {
        type: 'object',
        properties: {
          cluster_id: { type: 'string', format: 'uuid', nullable: true },
          db_name: { type: 'string', nullable: true, example: 'lg_ogo' },
          schema_version: { type: 'string', nullable: true, example: '20261110_001' },
          provisioned_at: { type: 'string', format: 'date-time', nullable: true },
          subscription_status: { type: 'string', nullable: true, example: 'trial' },
          subscription_end_date: { type: 'string', format: 'date', nullable: true },
          plan_code: { type: 'string', nullable: true, example: 'pro' },
        },
      },
    ],
  },
  ClientDetail: {
    allOf: [
      { $ref: '#/components/schemas/Client' },
      {
        type: 'object',
        properties: {
          subscription: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              status: { type: 'string', example: 'trial' },
              start_date: { type: 'string', format: 'date', example: '2026-11-10' },
              end_date: { type: 'string', format: 'date', nullable: true },
              trial_end_date: {
                type: 'string', format: 'date', nullable: true, example: '2026-12-10'
              },
              auto_renew: { type: 'boolean', example: true },
              plan_id: { type: 'string', format: 'uuid' },
              plan_code: { type: 'string', example: 'pro' },
              plan_name: { type: 'string', example: 'Pro' },
            },
          },
          db: {
            type: 'object',
            nullable: true,
            description: 'Ringkasan DB tenant (tanpa password)',
            properties: {
              db_name: { type: 'string', example: 'lg_ogo' },
              db_owner_username: { type: 'string', example: 'lg_ogo_owner' },
              db_app_username: { type: 'string', example: 'lg_ogo_app' },
              schema_version: { type: 'string', nullable: true, example: '20261110_001' },
              pool_max: { type: 'integer', example: 5 },
              provisioned_at: { type: 'string', format: 'date-time', nullable: true },
              password_rotated_at: { type: 'string', format: 'date-time', nullable: true },
              dropped_at: { type: 'string', format: 'date-time', nullable: true },
              cluster_id: { type: 'string', format: 'uuid' },
              cluster_name: { type: 'string', example: 'pg-prod-01' },
              cluster_host: { type: 'string', example: '10.0.0.10' },
            },
          },
          last_job: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              type: { type: 'string', example: 'provision' },
              status: { type: 'string', example: 'success' },
              failed_step: { type: 'string', nullable: true },
              error_message: { type: 'string', nullable: true },
              queued_at: { type: 'string', format: 'date-time' },
              finished_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    ],
  },
  ClientCreateRequest: {
    type: 'object',
    required: ['client_code', 'name', 'plan_code'],
    properties: {
      client_code: {
        type: 'string', pattern: '^[a-z0-9-]{3,30}$', description: 'Unik. Menjadi nama DB lg_{code} dan role lg_{code}_owner / lg_{code}_app (tanda - menjadi _)', example: 'ogo',
      },
      ...profile,
      plan_code: { type: 'string', example: 'pro' },
      subscription: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['trial', 'active'], default: 'trial' },
          start_date: {
            type: 'string', format: 'date', description: 'Default hari ini', example: '2026-11-10'
          },
          end_date: { type: 'string', format: 'date', nullable: true },
          trial_end_date: {
            type: 'string', format: 'date', nullable: true, example: '2026-12-10'
          },
          auto_renew: { type: 'boolean', default: true },
          notes: { type: 'string', nullable: true },
        },
      },
      cluster_id: {
        type: 'string', format: 'uuid', nullable: true, description: 'null = pilih otomatis cluster aktif dengan tenant paling sedikit'
      },
      pool_max: {
        type: 'integer', minimum: 1, maximum: 100, description: 'Maks koneksi pool di logistics-api', example: 5
      },
    },
  },
  ClientCreateResponse: {
    type: 'object',
    properties: {
      client: {
        allOf: [
          { $ref: '#/components/schemas/Client' },
          {
            type: 'object',
            properties: {
              plan_code: { type: 'string', example: 'pro' },
              subscription: { type: 'object', additionalProperties: true },
            },
          },
        ],
      },
      cluster: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string', example: 'pg-prod-01' } },
      },
      db: { type: 'object', properties: { db_name: { type: 'string', example: 'lg_ogo' } } },
      job_id: { type: 'string', format: 'uuid', example: '17461926-9506-4336-a0db-d879e1b3113e' },
      job_status: { type: 'string', example: 'queued' },
    },
  },
  ClientUpdateRequest: {
    type: 'object',
    minProperties: 1,
    properties: profile,
  },
  ClientStatusRequest: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'suspended'], example: 'suspended' },
      reason: { type: 'string', nullable: true, example: 'Tagihan belum dibayar' },
    },
  },
  DeprovisionRequest: {
    type: 'object',
    required: ['confirm_client_code'],
    properties: {
      confirm_client_code: { type: 'string', description: 'Harus sama dengan client_code (pengaman)', example: 'ogo' },
      backup: { type: 'boolean', default: true, description: 'pg_dump -Fc ke BACKUP_DIR sebelum drop' },
    },
  },
  TenantDbConfig: {
    allOf: [
      {
        type: 'object',
        description: 'Config DB tenant tanpa password',
        properties: {
          id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          cluster_id: { type: 'string', format: 'uuid' },
          db_name: { type: 'string', example: 'lg_ogo' },
          db_owner_username: { type: 'string', example: 'lg_ogo_owner' },
          db_app_username: { type: 'string', example: 'lg_ogo_app' },
          encryption_key_version: { type: 'integer', example: 1 },
          system_user_username: { type: 'string', example: 'msi.support' },
          schema_version: { type: 'string', nullable: true, example: '20261110_001' },
          pool_max: { type: 'integer', example: 5 },
          password_rotated_at: { type: 'string', format: 'date-time', nullable: true },
          provisioned_at: { type: 'string', format: 'date-time', nullable: true },
          dropped_at: { type: 'string', format: 'date-time', nullable: true },
          cluster_name: { type: 'string', example: 'pg-prod-01' },
          host: { type: 'string', example: '10.0.0.10' },
          port: { type: 'integer', example: 5432 },
          pooler_host: { type: 'string', nullable: true, example: '10.0.0.11' },
          pooler_port: { type: 'integer', nullable: true, example: 6432 },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  SystemUserReveal: {
    type: 'object',
    properties: {
      client_code: { type: 'string', example: 'ogo' },
      username: { type: 'string', example: 'msi.support' },
      password: { type: 'string', example: 'pX8m...rT2q' },
    },
  },
  AuditLog: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 120 },
          actor_type: { type: 'string', enum: ['admin', 'system', 'worker', 'logistics-api'], example: 'admin' },
          actor_id: { type: 'string', nullable: true, example: '507a8397-f279-4a53-b9ff-26101458b403' },
          action: { type: 'string', example: 'client.suspend' },
          target_type: { type: 'string', example: 'client' },
          target_id: { type: 'string', example: '8b9aa967-1dd5-488b-98f0-d7753afc806e' },
          before_data: { type: 'object', nullable: true, example: { status: 'active' } },
          after_data: { type: 'object', nullable: true, example: { status: 'suspended', reason: 'Tagihan belum dibayar' } },
          ip_address: { type: 'string', nullable: true, example: '10.0.0.5' },
          request_id: { type: 'string', nullable: true },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
}

module.exports = clientSchemas

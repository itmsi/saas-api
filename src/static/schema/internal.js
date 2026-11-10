/**
 * Swagger Schema Definitions for Internal (logistics-api) Module
 */

const encryptedPassword = {
  type: 'string',
  description: 'AES-256-GCM, base64(iv[12] | authTag[16] | ciphertext), key TENANT_DB_ENC_KEY',
  example: 'q2x0Yk9...base64...==',
}

const internalSchemas = {
  TenantResolve: {
    type: 'object',
    properties: {
      client_id: { type: 'string', format: 'uuid' },
      client_code: { type: 'string', example: 'ogo' },
      name: { type: 'string', example: 'OGO Logistics' },
      status: { type: 'string', example: 'active' },
      settings: { type: 'object', additionalProperties: true, example: { timezone: 'Asia/Jakarta' } },
      subscription: {
        type: 'object',
        nullable: true,
        properties: {
          status: { type: 'string', example: 'active' },
          plan_code: { type: 'string', example: 'pro' },
          end_date: {
            type: 'string', format: 'date', nullable: true, example: '2027-11-10'
          },
          trial_end_date: { type: 'string', format: 'date', nullable: true },
        },
      },
      features: { type: 'object', additionalProperties: true, example: { tracking: true } },
      limits: {
        type: 'object',
        properties: {
          max_users: { type: 'integer', nullable: true, example: 50 },
          max_shipments_per_month: { type: 'integer', nullable: true, example: 10000 },
        },
      },
      db: {
        type: 'object',
        description: 'Role APP (DML saja), lewat pooler jika ada',
        properties: {
          host: { type: 'string', example: '10.0.0.11' },
          port: { type: 'integer', example: 6432 },
          database: { type: 'string', example: 'lg_ogo' },
          username: { type: 'string', example: 'lg_ogo_app' },
          password_enc: encryptedPassword,
          key_version: { type: 'integer', example: 1 },
          pool_max: { type: 'integer', example: 5 },
        },
      },
      schema_version: { type: 'string', nullable: true, example: '20261110_001' },
    },
  },
  TenantResolveProvisioning: {
    allOf: [
      { $ref: '#/components/schemas/TenantResolve' },
      {
        type: 'object',
        properties: {
          db_owner: {
            type: 'object',
            description: 'Role OWNER (DDL) langsung ke Postgres, bukan lewat PgBouncer',
            properties: {
              host: { type: 'string', example: '10.0.0.10' },
              port: { type: 'integer', example: 5432 },
              database: { type: 'string', example: 'lg_ogo' },
              username: { type: 'string', example: 'lg_ogo_owner' },
              password_enc: encryptedPassword,
              key_version: { type: 'integer', example: 1 },
            },
          },
          system_user: {
            type: 'object',
            description: 'Ghost user untuk seeder',
            properties: {
              username: { type: 'string', example: 'msi.support' },
              password_enc: encryptedPassword,
              key_version: { type: 'integer', example: 1 },
            },
          },
        },
      },
    ],
  },
}

module.exports = internalSchemas

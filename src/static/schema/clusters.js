/**
 * Swagger Schema Definitions for DB Clusters Module
 */

const status = { type: 'string', enum: ['active', 'full', 'maintenance', 'disabled'], example: 'active' }

const clusterFields = {
  name: { type: 'string', maxLength: 100, example: 'pg-prod-01' },
  host: { type: 'string', description: 'Host Postgres (dipakai role owner & provisioner)', example: '10.0.0.10' },
  port: { type: 'integer', default: 5432, example: 5432 },
  pooler_host: {
    type: 'string', nullable: true, description: 'PgBouncer (dipakai role app). null = langsung ke host', example: '10.0.0.11'
  },
  pooler_port: { type: 'integer', nullable: true, example: 6432 },
  admin_secret_ref: {
    type: 'string', pattern: '^[A-Z][A-Z0-9_]+$', description: 'Prefix env kredensial provisioner di saas-worker: <ref>_USER, <ref>_PASSWORD', example: 'CLUSTER_PG_PROD_01',
  },
  max_tenants: { type: 'integer', default: 100, example: 100 },
  status,
}

const clusterSchemas = {
  Cluster: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '9f8e7d6c-5b4a-4321-8fed-cba987654321' },
          ...clusterFields,
          tenant_count: { type: 'integer', example: 12 },
          free_slots: { type: 'integer', example: 88 },
          usage_percent: { type: 'integer', example: 12 },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  ClusterCreateRequest: {
    type: 'object',
    required: ['name', 'host', 'admin_secret_ref'],
    properties: clusterFields,
  },
  ClusterUpdateRequest: {
    type: 'object',
    minProperties: 1,
    properties: clusterFields,
  },
  ClusterTestConnection: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', description: 'Koneksi berhasil', example: true },
      ready: { type: 'boolean', description: 'Role punya CREATEDB & CREATEROLE', example: true },
      latency_ms: { type: 'integer', example: 18 },
      username: { type: 'string', example: 'lg_provisioner' },
      server_version: { type: 'string', example: 'PostgreSQL 16.14 ...' },
      privileges: {
        type: 'object',
        properties: {
          superuser: { type: 'boolean', example: false },
          createdb: { type: 'boolean', example: true },
          createrole: { type: 'boolean', example: true },
        },
      },
      tenant_databases: { type: 'integer', description: 'Jumlah database lg_* di cluster', example: 12 },
      warning: { type: 'string', nullable: true, example: null },
      error: { type: 'string', description: 'Ada jika ok = false', example: 'password authentication failed for user "lg_provisioner"' },
    },
  },
}

module.exports = clusterSchemas

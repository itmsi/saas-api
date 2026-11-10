/**
 * Dokumen OpenAPI logistics-saas-api.
 * Disajikan di /documentation (UI) dan /documentation.json (raw).
 *
 * Struktur:
 *   index.js         -> info, servers, security, penggabung
 *   schema/<modul>   -> model data (components.schemas)
 *   path/<modul>     -> endpoint per modul
 *   helpers.js       -> helper kecil untuk bagian yang berulang
 *
 * Tambah endpoint baru: tulis di path/<modul>.js, model di schema/<modul>.js,
 * lalu daftarkan di bawah.
 */
const pkg = require('../../package.json')

const info = {
  title: 'logistics-saas-api Documentation',
  version: pkg.version,
  description: `
Control plane SaaS logistik: client (tenant), plan & subscription, registry cluster DB, config DB tenant (terenkripsi),
dan job provisioning yang dijalankan proses **saas-worker** lewat RabbitMQ
(create role & database → logistics-api migrasi, seeder, verifikasi → rollback jika gagal).

### Format response
- Sukses: \`{ "success": true, "data": ..., "meta": { "request_id": "...", ... } }\` (list menambah \`page, limit, total, total_pages\` di meta)
- Gagal: \`{ "success": false, "error": { "code", "message", "http_status", "details" }, "meta": { "request_id" } }\`
- Client memutuskan aksi dari \`error.code\`; \`message\` mengikuti header \`Accept-Language\` (\`id\` / \`en\`).

### Standar data
Semua tabel punya \`created_at\`, \`created_by\`, \`updated_at\`, \`updated_by\`, \`is_deleted\`, \`deleted_at\`, \`deleted_by\`.
Hapus = soft delete. \`*_by\` berisi id admin; \`null\` = aksi sistem / worker.

### Role admin
| Role | Akses |
|---|---|
| superadmin | semua, termasuk admin users, cluster, reveal system user |
| operator | baca & tulis client, plan, subscription, job, rollout |
| viewer | hanya GET |

### Alur provisioning
\`POST /clients\` → 202 + \`job_id\` → pantau \`GET /provisioning-jobs/{job_id}\` →
step: create_roles → create_database → grant_privileges → run_migrations → run_seeders → verify → finalize.
`,
  contact: { name: 'MSI' },
}

const servers = [
  { url: '/api/v1', description: 'Server ini' },
  ...(process.env.SWAGGER_GATEWAY_URL ? [{ url: process.env.SWAGGER_GATEWAY_URL, description: 'Gateway server (Kong)' }] : []),
]

// Import schemas
const commonSchema = require('./schema/common')
const authSchema = require('./schema/auth')
const adminUserSchema = require('./schema/admin_users')
const planSchema = require('./schema/plans')
const clusterSchema = require('./schema/clusters')
const clientSchema = require('./schema/clients')
const subscriptionSchema = require('./schema/subscriptions')
const provisioningSchema = require('./schema/provisioning')
const migrationSchema = require('./schema/migrations')
const internalSchema = require('./schema/internal')
const healthSchema = require('./schema/health')

// Import paths
const healthPaths = require('./path/health')
const authPaths = require('./path/auth')
const adminUserPaths = require('./path/admin_users')
const planPaths = require('./path/plans')
const clusterPaths = require('./path/clusters')
const clientPaths = require('./path/clients')
const subscriptionPaths = require('./path/subscriptions')
const provisioningPaths = require('./path/provisioning')
const migrationPaths = require('./path/migrations')
const internalPaths = require('./path/internal')

// Combine all schemas
const schemas = {
  ...commonSchema,
  ...authSchema,
  ...adminUserSchema,
  ...planSchema,
  ...clusterSchema,
  ...clientSchema,
  ...subscriptionSchema,
  ...provisioningSchema,
  ...migrationSchema,
  ...internalSchema,
  ...healthSchema,
}

// Combine all paths
const paths = {
  ...authPaths,
  ...adminUserPaths,
  ...planPaths,
  ...clusterPaths,
  ...clientPaths,
  ...subscriptionPaths,
  ...provisioningPaths,
  ...migrationPaths,
  ...internalPaths,
  ...healthPaths,
}

const tags = [
  { name: 'Auth', description: 'Login, refresh token, logout admin MSI' },
  { name: 'Admin Users', description: 'Kelola admin MSI (superadmin)' },
  { name: 'Plans', description: 'Paket langganan & feature flag' },
  { name: 'Clusters', description: 'Registry cluster Postgres untuk DB tenant' },
  { name: 'Clients', description: 'Client / tenant, config DB, ghost user, offboarding' },
  { name: 'Subscriptions', description: 'Langganan client' },
  { name: 'Provisioning Jobs', description: 'Pantau, retry, cleanup job saas-worker' },
  { name: 'Migrations', description: 'Rollout migrasi DB tenant' },
  { name: 'Internal (logistics-api)', description: 'Resolve tenant. Header X-Internal-Key, tidak diekspos publik' },
  { name: 'Health', description: 'Liveness & readiness' },
]

const index = {
  openapi: '3.0.3',
  info,
  servers,
  tags,
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token admin MSI dari POST /auth/login. Format: Bearer <token>',
      },
      InternalKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Internal-Key',
        description: 'INTERNAL_API_KEY (resolve biasa) atau INTERNAL_PROVISIONING_KEY (scope=provisioning). Hanya untuk logistics-api.',
      },
    },
    schemas,
    responses: commonSchema.commonResponses,
    parameters: commonSchema.commonParameters,
  },
}

module.exports = {
  index,
}

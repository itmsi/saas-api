/**
 * Swagger API Path Definitions for Internal Module (dipanggil logistics-api)
 * Ada di root /internal (bukan /api/v1) dan TIDAK diekspos di Kong publik.
 */
const {
  ref, response, errorBody, internalKey,
} = require('../helpers')

const tags = ['Internal (logistics-api)']
const rootServer = [{ url: '/', description: 'Root (jaringan internal)' }]
const scopeParam = {
  name: 'scope',
  in: 'query',
  required: false,
  description: '`provisioning` = untuk migrasi & seeder (role owner + system user), wajib INTERNAL_PROVISIONING_KEY',
  schema: { type: 'string', enum: ['default', 'provisioning'], default: 'default' },
}
const notActive = errorBody('Tenant tidak ada / tidak active', 'TENANT_NOT_ACTIVE', 'Tenant tidak ditemukan atau tidak aktif.', 404)
const cacheMeta = {
  type: 'object',
  properties: {
    request_id: { type: 'string' },
    cache: {
      type: 'string', enum: ['hit', 'miss', 'bypass'], description: 'bypass = scope provisioning (tidak di-cache)', example: 'hit'
    },
  },
}

const internalPaths = {
  '/internal/tenants/{client_code}/resolve': {
    servers: rootServer,
    get: {
      tags,
      summary: 'Resolve tenant by client_code',
      description: 'Untuk request user normal di logistics-api. Hanya tenant `active`. Return **role app** saja. '
        + 'Di-cache Redis `tenant:{client_code}` 10 menit; dihapus otomatis saat client / subscription / plan / password / schema_version berubah.',
      security: internalKey,
      parameters: [
        {
          name: 'client_code', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9-]{3,30}$', example: 'ogo' },
        },
        scopeParam,
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, data: ref('TenantResolve'), meta: cacheMeta },
              },
            },
          },
        },
        401: response('InvalidInternalKey'),
        403: errorBody('scope=provisioning dengan INTERNAL_API_KEY', 'FORBIDDEN', 'Anda tidak punya akses untuk aksi ini.', 403),
        404: notActive,
      },
    },
  },
  '/internal/tenants/by-id/{client_id}/resolve': {
    servers: rootServer,
    get: {
      tags,
      summary: 'Resolve tenant by client_id',
      description: '`scope=default`: sama seperti resolve by code.\n\n'
        + '`scope=provisioning`: untuk migrasi & seeder. Boleh status `provisioning`, `provisioning_failed`, `active`, `suspended`. '
        + 'Menambahkan `db_owner` (role DDL, langsung ke Postgres) dan `system_user`. Tidak di-cache, `Cache-Control: no-store`.',
      security: internalKey,
      parameters: [
        {
          name: 'client_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' },
        },
        scopeParam,
      ],
      responses: {
        200: {
          description: 'OK (schema TenantResolveProvisioning jika scope=provisioning)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { oneOf: [ref('TenantResolve'), ref('TenantResolveProvisioning')] },
                  meta: cacheMeta,
                },
              },
            },
          },
        },
        401: response('InvalidInternalKey'),
        403: errorBody('scope=provisioning dengan INTERNAL_API_KEY', 'FORBIDDEN', 'Anda tidak punya akses untuk aksi ini.', 403),
        404: notActive,
      },
    },
  },
}

module.exports = internalPaths

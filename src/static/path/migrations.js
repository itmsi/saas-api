/**
 * Swagger API Path Definitions for Migration Rollout Module
 */
const {
  ref, response, param, dataResponse, jsonBody, errorBody, bearer,
} = require('../helpers')

const tags = ['Migrations']

const migrationPaths = {
  '/migrations/status': {
    get: {
      tags,
      summary: 'Status migrasi',
      description: '**Role:** semua admin. Versi terbaru dari logistics-api `/internal/migrations/status` + jumlah tenant active/suspended per `schema_version`.',
      security: bearer,
      responses: {
        200: dataResponse('OK', ref('MigrationStatus')),
        401: response('Unauthorized'),
      },
    },
  },
  '/migrations/rollout': {
    post: {
      tags,
      summary: 'Rollout migrasi',
      description: '**Role:** superadmin, operator. Deploy logistics-api versi baru dulu, lalu panggil endpoint ini. '
        + 'Membuat 1 job `migrate` per tenant active. Tenant yang sedang punya job aktif dilewati (`skipped`). '
        + 'Migrasi yang gagal **tidak** men-drop DB.',
      security: bearer,
      requestBody: jsonBody('RolloutRequest', undefined, {
        required: false,
        examples: {
          all: { summary: 'Semua tenant active', value: { client_ids: [], target: 'latest' } },
          some: { summary: 'Sebagian tenant', value: { client_ids: ['8b9aa967-1dd5-488b-98f0-d7753afc806e'], target: 'latest' } },
        },
      }),
      responses: {
        202: dataResponse('Rollout dijadwalkan', ref('RolloutAccepted')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        422: errorBody('Tidak ada tenant active yang cocok', 'VALIDATION_ERROR', 'Data tidak valid.', 422, [{ field: 'client_ids', message: 'Tidak ada tenant active yang cocok' }]),
        502: errorBody('logistics-api tidak merespons', 'UPSTREAM_ERROR', 'Layanan lain tidak merespons dengan benar.', 502, { service: 'logistics-api' }),
      },
    },
  },
  '/migrations/rollouts': {
    get: {
      tags,
      summary: 'List rollout',
      description: '**Role:** semua admin',
      security: bearer,
      parameters: [
        param('PageParam'),
        param('LimitParam'),
        {
          name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['running', 'completed', 'completed_with_errors'] },
        },
      ],
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('Rollout') }, { paginated: true }),
        401: response('Unauthorized'),
      },
    },
  },
  '/migrations/rollouts/{id}': {
    get: {
      tags,
      summary: 'Progress rollout',
      description: '**Role:** semua admin. Jumlah job per status + daftar tenant yang gagal.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('OK', ref('RolloutDetail')),
        401: response('Unauthorized'),
        404: response('NotFound'),
      },
    },
  },
  '/migrations/rollouts/{id}/retry-failed': {
    post: {
      tags,
      summary: 'Ulangi tenant yang gagal',
      description: '**Role:** superadmin, operator. Hanya job terakhir per tenant yang statusnya `failed`.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        202: dataResponse('Job dijadwalkan', ref('RolloutRetryResponse')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
      },
    },
  },
}

module.exports = migrationPaths

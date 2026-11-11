/**
 * Swagger API Path Definitions for Plans Module
 */
const {
  ref, response, param, dataResponse, jsonBody, listBody, errorBody, bearer,
} = require('../helpers')

const tags = ['Plans']

const planPaths = {
  '/plans/list': {
    post: {
      tags,
      summary: 'List plan',
      description: '**Role:** semua admin',
      security: bearer,
      requestBody: listBody({ is_active: { type: 'boolean' } }, { example: { is_active: true } }),
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('Plan') }),
        401: response('Unauthorized'),
      },
    },
  },
  '/plans': {
    post: {
      tags,
      summary: 'Buat plan',
      description: '**Role:** superadmin, operator',
      security: bearer,
      requestBody: jsonBody('PlanCreateRequest', {
        code: 'pro',
        name: 'Pro',
        max_users: 50,
        max_shipments_per_month: 10000,
        features: { tracking: true, driver_app: true, reports: true },
        price_monthly: 1500000,
      }),
      responses: {
        201: dataResponse('Plan dibuat', ref('Plan')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        409: errorBody('Kode plan sudah dipakai', 'PLAN_CODE_TAKEN', 'Kode plan sudah dipakai.', 409),
        422: response('ValidationError'),
      },
    },
  },
  '/plans/{id}': {
    get: {
      tags,
      summary: 'Detail plan',
      description: '**Role:** semua admin',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('OK', ref('Plan')),
        401: response('Unauthorized'),
        404: response('NotFound'),
      },
    },
    patch: {
      tags,
      summary: 'Ubah plan / feature flags',
      description: '**Role:** superadmin, operator. Cache semua tenant yang memakai plan ini dihapus (`meta.invalidated_tenants`), sehingga logistics-api langsung membaca feature/limit baru.',
      security: bearer,
      parameters: [param('IdParam')],
      requestBody: jsonBody('PlanUpdateRequest', { features: { tracking: true, reports: true, api_access: true }, max_users: 100 }),
      responses: {
        200: {
          description: 'Plan diperbarui',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: ref('Plan'),
                  meta: {
                    type: 'object',
                    properties: { request_id: { type: 'string' }, invalidated_tenants: { type: 'integer', example: 12 } },
                  },
                },
              },
            },
          },
        },
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        422: response('ValidationError'),
      },
    },
    delete: {
      tags,
      summary: 'Hapus plan (soft delete)',
      description: '**Role:** superadmin, operator. Ditolak jika masih dipakai subscription trial / active / past_due.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('Plan dihapus', ref('DeletedResult')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: errorBody('Plan masih dipakai', 'PLAN_IN_USE', 'Plan masih dipakai subscription aktif.', 409),
      },
    },
  },
}

module.exports = planPaths

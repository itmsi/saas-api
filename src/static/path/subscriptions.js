/**
 * Swagger API Path Definitions for Subscriptions Module
 */
const {
  ref, response, param, dataResponse, jsonBody, errorBody, bearer,
} = require('../helpers')

const tags = ['Subscriptions']

const subscriptionPaths = {
  '/clients/{id}/subscriptions': {
    get: {
      tags,
      summary: 'Histori subscription client',
      description: '**Role:** semua admin. Urut start_date terbaru.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('Subscription') }),
        401: response('Unauthorized'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
      },
    },
    post: {
      tags,
      summary: 'Buat / ganti subscription',
      description: '**Role:** superadmin, operator. Subscription yang sedang berjalan (trial / active / past_due) otomatis di-cancel dengan end_date = start_date baru. '
        + 'Cache tenant dihapus. ID yang di-cancel ada di `meta.cancelled_subscription_ids`.',
      security: bearer,
      parameters: [param('IdParam')],
      requestBody: jsonBody('SubscriptionCreateRequest', {
        plan_code: 'enterprise', status: 'active', start_date: '2026-12-01', end_date: '2027-11-30', auto_renew: true,
      }),
      responses: {
        201: {
          description: 'Subscription dibuat',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: ref('Subscription'),
                  meta: {
                    type: 'object',
                    properties: {
                      request_id: { type: 'string' },
                      cancelled_subscription_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    },
                  },
                },
              },
            },
          },
        },
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
        422: response('ValidationError'),
      },
    },
  },
  '/subscriptions/{id}': {
    patch: {
      tags,
      summary: 'Ubah status / tanggal subscription',
      description: '**Role:** superadmin, operator. Cache tenant dihapus. Satu client hanya boleh punya satu subscription trial / active / past_due (409 jika bentrok).',
      security: bearer,
      parameters: [param('IdParam')],
      requestBody: jsonBody('SubscriptionUpdateRequest', { status: 'past_due' }),
      responses: {
        200: dataResponse('Subscription diperbarui', ref('Subscription')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: errorBody('Bentrok dengan subscription berjalan lain', 'CONFLICT', 'Data bentrok dengan kondisi saat ini.', 409, { constraint: 'uq_subscriptions_current' }),
        422: response('ValidationError'),
      },
    },
  },
}

module.exports = subscriptionPaths

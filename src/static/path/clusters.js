/**
 * Swagger API Path Definitions for DB Clusters Module
 */
const {
  ref, response, param, dataResponse, jsonBody, errorBody, bearer,
} = require('../helpers')

const tags = ['Clusters']

const clusterPaths = {
  '/clusters': {
    get: {
      tags,
      summary: 'List cluster + kapasitas',
      description: '**Role:** semua admin',
      security: bearer,
      parameters: [{
        name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['active', 'full', 'maintenance', 'disabled'] },
      }],
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('Cluster') }),
        401: response('Unauthorized'),
      },
    },
    post: {
      tags,
      summary: 'Daftarkan cluster',
      description: '**Role:** superadmin. Kredensial provisioner TIDAK dikirim lewat API; pasang `<admin_secret_ref>_USER` dan `<admin_secret_ref>_PASSWORD` di env saas-worker.',
      security: bearer,
      requestBody: jsonBody('ClusterCreateRequest', {
        name: 'pg-prod-01',
        host: '10.0.0.10',
        port: 5432,
        pooler_host: '10.0.0.11',
        pooler_port: 6432,
        admin_secret_ref: 'CLUSTER_PG_PROD_01',
        max_tenants: 100,
      }),
      responses: {
        201: dataResponse('Cluster didaftarkan', ref('Cluster')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        409: errorBody('Nama cluster sudah dipakai', 'CLUSTER_NAME_TAKEN', 'Nama cluster sudah dipakai.', 409),
        422: response('ValidationError'),
      },
    },
  },
  '/clusters/{id}': {
    get: {
      tags,
      summary: 'Detail cluster',
      description: '**Role:** semua admin',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('OK', ref('Cluster')),
        401: response('Unauthorized'),
        404: response('NotFound'),
      },
    },
    patch: {
      tags,
      summary: 'Ubah host / kapasitas / status cluster',
      description: '**Role:** superadmin. Cluster berstatus selain `active` tidak dipilih untuk client baru.',
      security: bearer,
      parameters: [param('IdParam')],
      requestBody: jsonBody('ClusterUpdateRequest', { max_tenants: 150, status: 'maintenance' }),
      responses: {
        200: dataResponse('Cluster diperbarui', ref('Cluster')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: errorBody('Nama cluster sudah dipakai', 'CLUSTER_NAME_TAKEN', 'Nama cluster sudah dipakai.', 409),
        422: response('ValidationError'),
      },
    },
    delete: {
      tags,
      summary: 'Hapus cluster (soft delete)',
      description: '**Role:** superadmin. Hanya jika cluster tidak berisi tenant.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('Cluster dihapus', ref('DeletedResult')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: errorBody('Cluster masih berisi tenant', 'CLUSTER_IN_USE', 'Cluster masih berisi tenant.', 409),
      },
    },
  },
  '/clusters/{id}/test-connection': {
    post: {
      tags,
      summary: 'Tes koneksi role provisioner',
      description: '**Role:** superadmin. Diteruskan ke saas-worker (`WORKER_INTERNAL_URL`) karena hanya worker yang memegang kredensial provisioner. '
        + 'Koneksi gagal tetap HTTP 200 dengan `ok: false` dan pesan error.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('Hasil tes koneksi', ref('ClusterTestConnection')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        503: errorBody('saas-worker tidak bisa dihubungi', 'SERVICE_UNAVAILABLE', 'Layanan sedang tidak tersedia.', 503, { reason: 'worker_unreachable' }),
      },
    },
  },
}

module.exports = clusterPaths

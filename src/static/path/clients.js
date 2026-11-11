/**
 * Swagger API Path Definitions for Clients Module
 */
const {
  ref, response, param, dataResponse, jsonBody, listBody, errorBody, bearer,
} = require('../helpers')

const tags = ['Clients']
const idParam = param('IdParam')

const clientPaths = {
  '/clients/list': {
    post: {
      tags,
      summary: 'List client',
      description: '**Role:** semua admin. Termasuk ringkasan DB, subscription berjalan, dan plan.',
      security: bearer,
      requestBody: listBody({
        status: {
          oneOf: [
            { type: 'string', enum: ['provisioning', 'provisioning_failed', 'active', 'suspended', 'deprovisioning', 'deleted'] },
            { type: 'array', items: { type: 'string', enum: ['provisioning', 'provisioning_failed', 'active', 'suspended', 'deprovisioning', 'deleted'] } },
          ],
          description: 'Satu status atau array, mis. ["active", "suspended"]',
        },
        search: { type: 'string', description: 'Cari di client_code / nama / email' },
        cluster_id: { type: 'string', format: 'uuid' },
        plan_code: { type: 'string' },
        sort: {
          type: 'string', enum: ['created_at', 'client_code', 'name', 'status'], default: 'created_at',
        },
        order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
      }, {
        paginated: true,
        example: {
          page: 1, limit: 20, status: ['active', 'suspended'], search: 'acme', sort: 'created_at', order: 'desc',
        }
      }),
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('ClientListItem') }, { paginated: true }),
        401: response('Unauthorized'),
      },
    },
  },
  '/clients': {
    post: {
      tags,
      summary: 'Buat client + config DB + job provisioning',
      description: '**Role:** superadmin, operator.\n\n'
        + 'Dalam **satu transaksi**: insert `clients` (status provisioning), `subscriptions`, `tenant_db_configs` (password random terenkripsi), '
        + '`provisioning_jobs` + 7 `provisioning_steps`, dan `outbox_events`. Lalu `db_clusters.tenant_count + 1`.\n\n'
        + 'Response **202** + `job_id`. Pantau dengan `GET /provisioning-jobs/{job_id}`.',
      security: bearer,
      requestBody: jsonBody('ClientCreateRequest', {
        client_code: 'ogo',
        name: 'OGO Logistics',
        legal_name: 'PT Owngo Logistics Indonesia',
        email: 'admin@ogo.co.id',
        phone: '0812xxxx',
        plan_code: 'pro',
        subscription: { status: 'trial', start_date: '2026-11-10', trial_end_date: '2026-12-10' },
        cluster_id: null,
        settings: { timezone: 'Asia/Jakarta' },
      }),
      responses: {
        202: dataResponse('Client dibuat, provisioning dijadwalkan', ref('ClientCreateResponse')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        409: {
          description: 'Kode dipakai / tidak ada cluster tersedia',
          content: {
            'application/json': {
              schema: ref('ErrorResponse'),
              examples: {
                codeTaken: {
                  summary: 'client_code sudah dipakai',
                  value: { success: false, error: { code: 'CLIENT_CODE_TAKEN', message: 'Kode client sudah dipakai.', http_status: 409 } },
                },
                noCluster: {
                  summary: 'Semua cluster penuh / tidak aktif',
                  value: { success: false, error: { code: 'NO_CLUSTER_AVAILABLE', message: 'Tidak ada cluster aktif yang masih punya kapasitas.', http_status: 409 } },
                },
              },
            },
          },
        },
        422: response('ValidationError'),
      },
    },
  },
  '/clients/{id}': {
    get: {
      tags,
      summary: 'Detail client',
      description: '**Role:** semua admin. Client + subscription berjalan + ringkasan DB (tanpa password) + job terakhir.',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: dataResponse('OK', ref('ClientDetail')),
        401: response('Unauthorized'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
      },
    },
    patch: {
      tags,
      summary: 'Ubah profil client',
      description: '**Role:** superadmin, operator. Cache tenant dihapus.',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('ClientUpdateRequest', { name: 'OGO Logistics Indonesia', phone: '0813xxxx' }),
      responses: {
        200: dataResponse('Client diperbarui', ref('Client')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
        422: response('ValidationError'),
      },
    },
  },
  '/clients/{id}/status': {
    patch: {
      tags,
      summary: 'Suspend / activate client',
      description: '**Role:** superadmin, operator. Hanya active ↔ suspended. Cache Redis dihapus dan event `tenant-invalidate` dipublish, sehingga logistics-api menutup pool tenant.',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('ClientStatusRequest', undefined, {
        examples: {
          suspend: { summary: 'Suspend', value: { status: 'suspended', reason: 'Tagihan belum dibayar' } },
          activate: { summary: 'Activate', value: { status: 'active' } },
        },
      }),
      responses: {
        200: dataResponse('Status diperbarui', ref('Client')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
        409: errorBody('Transisi status tidak valid', 'INVALID_STATE', 'Aksi tidak bisa dilakukan pada status saat ini.', 409, { from: 'provisioning', to: 'suspended' }),
        422: response('ValidationError'),
      },
    },
  },
  '/clients/{id}/deprovision': {
    post: {
      tags,
      summary: 'Offboarding client',
      description: '**Role:** superadmin, operator. Job `deprovision`: backup (opsional) → revoke connect & putus koneksi → drop database → drop role → '
        + 'client soft delete (status deleted), `tenant_count - 1`, cache dihapus.',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('DeprovisionRequest', { confirm_client_code: 'ogo', backup: true }),
      responses: {
        202: dataResponse('Job deprovision dijadwalkan', ref('JobAccepted')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
        409: errorBody('Status tidak valid / ada job aktif', 'JOB_ALREADY_RUNNING', 'Masih ada job aktif untuk client ini.', 409),
        422: errorBody('confirm_client_code tidak cocok', 'VALIDATION_ERROR', 'Data tidak valid.', 422, [{ field: 'confirm_client_code', message: 'Harus sama dengan client_code' }]),
      },
    },
  },
  '/clients/{id}/db-config': {
    get: {
      tags,
      summary: 'Config DB tenant',
      description: '**Role:** semua admin. Tanpa password.',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: dataResponse('OK', ref('TenantDbConfig')),
        401: response('Unauthorized'),
        404: response('NotFound'),
      },
    },
  },
  '/clients/{id}/rotate-db-password': {
    post: {
      tags,
      summary: 'Rotasi password DB',
      description: '**Role:** superadmin, operator. Job `rotate_password`: password baru role owner & app → ALTER ROLE → simpan terenkripsi → cache dihapus (logistics-api membuat pool baru).',
      security: bearer,
      parameters: [idParam],
      responses: {
        202: dataResponse('Job dijadwalkan', ref('JobAccepted')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
        409: errorBody('Status tidak valid / ada job aktif', 'INVALID_STATE', 'Aksi tidak bisa dilakukan pada status saat ini.', 409),
      },
    },
  },
  '/clients/{id}/reveal-system-user': {
    post: {
      tags,
      summary: 'Lihat password ghost user',
      description: '**Role:** superadmin. Setiap pemanggilan tercatat di audit log (`client.reveal_system_user`). Response `Cache-Control: no-store`.',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: dataResponse('OK', ref('SystemUserReveal')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
      },
    },
  },
  '/clients/{id}/reset-system-user': {
    post: {
      tags,
      summary: 'Reset password ghost user',
      description: '**Role:** superadmin, operator. Job `reset_system_user`: password baru disimpan → worker memanggil logistics-api `/internal/tenants/{id}/system-user/reset`. Jika gagal, password lama dikembalikan.',
      security: bearer,
      parameters: [idParam],
      responses: {
        202: dataResponse('Job dijadwalkan', ref('JobAccepted')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
        409: errorBody('Status tidak valid / ada job aktif', 'INVALID_STATE', 'Aksi tidak bisa dilakukan pada status saat ini.', 409),
      },
    },
  },
  '/clients/{id}/jobs': {
    post: {
      tags,
      summary: 'Histori job client',
      description: '**Role:** semua admin',
      security: bearer,
      parameters: [idParam],
      requestBody: listBody({
        type: { type: 'string', enum: ['provision', 'migrate', 'cleanup', 'deprovision', 'rotate_password', 'reset_system_user'] },
        status: { type: 'string', enum: ['queued', 'running', 'success', 'failed', 'rolling_back', 'rolled_back', 'rollback_failed'] },
      }, {
        paginated: true,
        example: {
          page: 1, limit: 20, type: 'provision', status: 'failed'
        }
      }),
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('ProvisioningJob') }, { paginated: true }),
        401: response('Unauthorized'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
      },
    },
  },
  '/clients/{id}/audit-logs': {
    post: {
      tags,
      summary: 'Histori aktivitas client',
      description: '**Role:** semua admin. Semua aksi admin & worker terhadap client ini.',
      security: bearer,
      parameters: [idParam],
      requestBody: listBody({}, { paginated: true }),
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('AuditLog') }, { paginated: true }),
        401: response('Unauthorized'),
        404: errorBody('Client tidak ditemukan', 'CLIENT_NOT_FOUND', 'Client tidak ditemukan.', 404),
      },
    },
  },
}

module.exports = clientPaths

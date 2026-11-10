/**
 * Swagger API Path Definitions for Admin Users Module (khusus superadmin)
 */
const {
  ref, response, param, dataResponse, jsonBody, errorBody, bearer,
} = require('../helpers')

const tags = ['Admin Users']

const adminUserPaths = {
  '/admin-users': {
    get: {
      tags,
      summary: 'List admin MSI',
      description: '**Role:** superadmin',
      security: bearer,
      parameters: [
        param('PageParam'),
        param('LimitParam'),
        {
          name: 'search', in: 'query', required: false, description: 'Cari di email / nama', schema: { type: 'string' },
        },
        {
          name: 'role', in: 'query', required: false, schema: { type: 'string', enum: ['superadmin', 'operator', 'viewer'] },
        },
        {
          name: 'is_active', in: 'query', required: false, schema: { type: 'boolean' },
        },
      ],
      responses: {
        200: dataResponse('OK', { type: 'array', items: ref('AdminUser') }, { paginated: true }),
        401: response('Unauthorized'),
        403: response('Forbidden'),
      },
    },
    post: {
      tags,
      summary: 'Tambah admin',
      description: '**Role:** superadmin',
      security: bearer,
      requestBody: jsonBody('AdminUserCreateRequest', {
        email: 'ops@msi.co.id', name: 'Operator MSI', password: 'minimal-10-karakter', role: 'operator',
      }),
      responses: {
        201: dataResponse('Admin dibuat', ref('AdminUser')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        409: errorBody('Email sudah dipakai', 'EMAIL_TAKEN', 'Email sudah dipakai.', 409),
        422: response('ValidationError'),
      },
    },
  },
  '/admin-users/{id}': {
    get: {
      tags,
      summary: 'Detail admin',
      description: '**Role:** superadmin',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('OK', ref('AdminUser')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
      },
    },
    patch: {
      tags,
      summary: 'Ubah data / role / nonaktifkan admin',
      description: '**Role:** superadmin. `is_active: false` mencabut semua sesi admin tersebut. Tidak bisa menonaktifkan / menurunkan role diri sendiri.',
      security: bearer,
      parameters: [param('IdParam')],
      requestBody: jsonBody('AdminUserUpdateRequest', { role: 'viewer', is_active: false }),
      responses: {
        200: dataResponse('Admin diperbarui', ref('AdminUser')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: errorBody('Email dipakai / ubah akun sendiri', 'CANNOT_DELETE_SELF', 'Tidak bisa menghapus / menonaktifkan akun sendiri.', 409),
        422: response('ValidationError'),
      },
    },
    delete: {
      tags,
      summary: 'Hapus admin (soft delete)',
      description: '**Role:** superadmin. Mengisi is_deleted, deleted_at, deleted_by dan mencabut semua sesi.',
      security: bearer,
      parameters: [param('IdParam')],
      responses: {
        200: dataResponse('Admin dihapus', ref('DeletedResult')),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        409: errorBody('Menghapus akun sendiri', 'CANNOT_DELETE_SELF', 'Tidak bisa menghapus / menonaktifkan akun sendiri.', 409),
      },
    },
  },
  '/admin-users/{id}/reset-password': {
    post: {
      tags,
      summary: 'Reset password admin',
      description: '**Role:** superadmin. Semua sesi admin tersebut dicabut.',
      security: bearer,
      parameters: [param('IdParam')],
      requestBody: jsonBody('ResetPasswordRequest', { password: 'password-baru-123' }),
      responses: {
        200: dataResponse('Password direset', { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, password_reset: { type: 'boolean', example: true } } }),
        401: response('Unauthorized'),
        403: response('Forbidden'),
        404: response('NotFound'),
        422: response('ValidationError'),
      },
    },
  },
}

module.exports = adminUserPaths

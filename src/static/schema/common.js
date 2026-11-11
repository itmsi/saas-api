/**
 * Common Swagger Schema Definitions
 * Schema, response, dan parameter yang dipakai banyak modul
 */

const commonSchemas = {
  Meta: {
    type: 'object',
    properties: {
      request_id: { type: 'string', description: 'ID request (header X-Request-ID)', example: '1dc38260-3342-4297-916d-05d2243e1dba' },
    },
    additionalProperties: true,
  },
  PaginationMeta: {
    type: 'object',
    properties: {
      request_id: { type: 'string', example: '1dc38260-3342-4297-916d-05d2243e1dba' },
      page: { type: 'integer', description: 'Halaman saat ini', example: 1 },
      limit: { type: 'integer', description: 'Jumlah data per halaman', example: 20 },
      total: { type: 'integer', description: 'Total data', example: 57 },
      total_pages: { type: 'integer', description: 'Total halaman', example: 3 },
    },
  },
  SuccessResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { description: 'Isi response (lihat schema masing-masing endpoint)' },
      meta: { $ref: '#/components/schemas/Meta' },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Kode error stabil, dipakai client untuk menentukan aksi', example: 'CLIENT_CODE_TAKEN' },
          message: { type: 'string', description: 'Pesan siap tampil, mengikuti header Accept-Language (id | en)', example: 'Kode client sudah dipakai.' },
          http_status: { type: 'integer', example: 409 },
          details: {
            description: 'Info tambahan. Array {field, message} untuk VALIDATION_ERROR, object untuk error lain.',
            nullable: true,
          },
        },
      },
      meta: { $ref: '#/components/schemas/Meta' },
    },
  },
  ValidationIssue: {
    type: 'object',
    properties: {
      field: { type: 'string', example: 'client_code' },
      message: { type: 'string', example: 'client_code hanya huruf kecil, angka, dan tanda -, 3-30 karakter' },
    },
  },
  AuditFields: {
    type: 'object',
    description: 'Kolom standar semua tabel. *_by = id admin_users, null = sistem / worker. is_deleted, deleted_at, deleted_by tidak dikirim di response.',
    properties: {
      created_at: { type: 'string', format: 'date-time', example: '2026-11-10T08:14:18.030Z' },
      created_by: {
        type: 'string', format: 'uuid', nullable: true, example: '507a8397-f279-4a53-b9ff-26101458b403'
      },
      updated_at: { type: 'string', format: 'date-time', example: '2026-11-10T08:14:23.208Z' },
      updated_by: {
        type: 'string', format: 'uuid', nullable: true, example: null
      },
    },
  },
  JobAccepted: {
    type: 'object',
    description: 'Job dibuat dan akan diproses saas-worker. Pantau dengan GET /provisioning-jobs/{id}',
    properties: {
      client_id: { type: 'string', format: 'uuid', example: '8b9aa967-1dd5-488b-98f0-d7753afc806e' },
      job_id: { type: 'string', format: 'uuid', example: '3ef5c94c-1648-4504-b408-547f0f35aad4' },
      job_type: { type: 'string', example: 'rotate_password' },
      job_status: { type: 'string', example: 'queued' },
    },
  },
  DeletedResult: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', example: '507a8397-f279-4a53-b9ff-26101458b403' },
      deleted: { type: 'boolean', example: true },
    },
  },
}

const errorExample = (code, message, httpStatus, details) => ({
  success: false,
  error: {
    code, message, http_status: httpStatus, ...(details ? { details } : {}),
  },
  meta: { request_id: '1dc38260-3342-4297-916d-05d2243e1dba' },
})

const errorResponse = (description, example) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example } },
})

const commonResponses = {
  Unauthorized: errorResponse('Token tidak ada / tidak valid / kedaluwarsa', errorExample('UNAUTHORIZED', 'Sesi berakhir, silakan masuk lagi.', 401)),
  Forbidden: errorResponse('Role admin tidak punya akses', errorExample('FORBIDDEN', 'Anda tidak punya akses untuk aksi ini.', 403)),
  NotFound: errorResponse('Data tidak ditemukan', errorExample('NOT_FOUND', 'Data tidak ditemukan.', 404)),
  ValidationError: errorResponse('Input tidak valid', errorExample('VALIDATION_ERROR', 'Data tidak valid.', 422, [
    { field: 'name', message: '"name" is required' },
  ])),
  RateLimited: errorResponse('Terlalu banyak request', errorExample('RATE_LIMITED', 'Terlalu banyak permintaan, coba lagi nanti.', 429)),
  InternalError: errorResponse('Kesalahan server', errorExample('INTERNAL_ERROR', 'Terjadi kesalahan pada server.', 500)),
  InvalidInternalKey: errorResponse('X-Internal-Key tidak valid', errorExample('INVALID_INTERNAL_KEY', 'Internal key tidak valid.', 401)),
}

const commonParameters = {
  IdParam: {
    name: 'id', in: 'path', required: true, description: 'ID (UUID)', schema: { type: 'string', format: 'uuid' },
  },
  AcceptLanguage: {
    name: 'Accept-Language', in: 'header', required: false, description: 'Bahasa pesan error', schema: { type: 'string', enum: ['id', 'en'], default: 'id' },
  },
}

Object.defineProperties(commonSchemas, {
  commonResponses: { value: commonResponses, enumerable: false },
  commonParameters: { value: commonParameters, enumerable: false },
})

module.exports = commonSchemas

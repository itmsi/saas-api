/**
 * Swagger Schema Definitions for Admin Users Module
 */

const role = {
  type: 'string', enum: ['superadmin', 'operator', 'viewer'], description: 'superadmin: semua akses · operator: baca & tulis · viewer: hanya baca', example: 'operator'
}

const adminUserSchemas = {
  AdminUser: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '507a8397-f279-4a53-b9ff-26101458b403' },
          email: { type: 'string', format: 'email', example: 'ops@msi.co.id' },
          name: { type: 'string', example: 'Operator MSI' },
          role,
          is_active: { type: 'boolean', example: true },
          last_login_at: {
            type: 'string', format: 'date-time', nullable: true, example: '2026-11-10T08:13:31.000Z'
          },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  AdminUserCreateRequest: {
    type: 'object',
    required: ['email', 'name', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'ops@msi.co.id' },
      name: { type: 'string', maxLength: 150, example: 'Operator MSI' },
      password: {
        type: 'string', format: 'password', minLength: 10, example: 'minimal-10-karakter'
      },
      role: { ...role, default: 'operator' },
    },
  },
  AdminUserUpdateRequest: {
    type: 'object',
    minProperties: 1,
    properties: {
      email: { type: 'string', format: 'email', example: 'ops2@msi.co.id' },
      name: { type: 'string', example: 'Operator MSI 2' },
      role,
      is_active: { type: 'boolean', description: 'false = nonaktif, semua sesi dicabut', example: false },
    },
  },
  ResetPasswordRequest: {
    type: 'object',
    required: ['password'],
    properties: {
      password: {
        type: 'string', format: 'password', minLength: 10, example: 'password-baru-123'
      },
    },
  },
}

module.exports = adminUserSchemas

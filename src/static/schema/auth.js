/**
 * Swagger Schema Definitions for Auth Module
 */

const authSchemas = {
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@msi.local' },
      password: { type: 'string', format: 'password', example: 'admin-password-123' },
    },
  },
  RefreshTokenRequest: {
    type: 'object',
    required: ['refresh_token'],
    properties: {
      refresh_token: { type: 'string', description: 'Format "<id>.<secret>" dari response login / refresh', example: '6f1c2b0e-1a2b-4c3d-9e8f-0a1b2c3d4e5f.Jx0k...' },
    },
  },
  TokenResponse: {
    type: 'object',
    properties: {
      token_type: { type: 'string', example: 'Bearer' },
      access_token: { type: 'string', description: 'JWT, dipakai di header Authorization: Bearer <token>', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      expires_in: { type: 'integer', description: 'Umur access token (detik)', example: 900 },
      refresh_token: { type: 'string', description: 'Sekali pakai; setiap refresh menghasilkan refresh token baru', example: '6f1c2b0e-1a2b-4c3d-9e8f-0a1b2c3d4e5f.Jx0k...' },
      refresh_expires_in: { type: 'integer', description: 'Umur refresh token (detik)', example: 604800 },
    },
  },
  LoginResponse: {
    allOf: [
      { $ref: '#/components/schemas/TokenResponse' },
      {
        type: 'object',
        properties: {
          admin: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid', example: '507a8397-f279-4a53-b9ff-26101458b403' },
              email: { type: 'string', example: 'admin@msi.local' },
              name: { type: 'string', example: 'Super Admin MSI' },
              role: { type: 'string', enum: ['superadmin', 'operator', 'viewer'], example: 'superadmin' },
            },
          },
        },
      },
    ],
  },
}

module.exports = authSchemas

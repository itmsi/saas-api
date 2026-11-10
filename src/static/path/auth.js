/**
 * Swagger API Path Definitions for Auth Module
 */
const {
  ref, response, dataResponse, jsonBody, errorBody, bearer,
} = require('../helpers')

const authPaths = {
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login admin MSI',
      description: 'Login dengan email & password. Menghasilkan access token (JWT, default 15 menit) dan refresh token (default 7 hari). Dibatasi rate limit.',
      security: [],
      requestBody: jsonBody('LoginRequest', { email: 'admin@msi.local', password: 'admin-password-123' }),
      responses: {
        200: dataResponse('Login berhasil', ref('LoginResponse')),
        401: errorBody('Email / password salah, atau akun nonaktif', 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.', 401),
        422: response('ValidationError'),
        429: response('RateLimited'),
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Tukar refresh token dengan token baru. Refresh token **sekali pakai**: token lama langsung dicabut (rotasi).',
      security: [],
      requestBody: jsonBody('RefreshTokenRequest', { refresh_token: '6f1c2b0e-1a2b-4c3d-9e8f-0a1b2c3d4e5f.Jx0k...' }),
      responses: {
        200: dataResponse('Token baru', ref('TokenResponse')),
        401: errorBody('Refresh token tidak valid / sudah dipakai / kedaluwarsa', 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid atau sudah dicabut.', 401),
        422: response('ValidationError'),
        429: response('RateLimited'),
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout',
      description: 'Cabut refresh token milik admin yang login.',
      security: bearer,
      requestBody: jsonBody('RefreshTokenRequest', { refresh_token: '6f1c2b0e-1a2b-4c3d-9e8f-0a1b2c3d4e5f.Jx0k...' }),
      responses: {
        200: dataResponse('Logout berhasil', { type: 'object', properties: { logged_out: { type: 'boolean', example: true } } }),
        401: response('Unauthorized'),
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Profil admin',
      description: 'Profil admin yang sedang login.',
      security: bearer,
      responses: {
        200: dataResponse('OK', ref('AdminUser')),
        401: response('Unauthorized'),
      },
    },
  },
}

module.exports = authPaths

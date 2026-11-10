const jwt = require('jsonwebtoken')
const config = require('../config')
const { AppError } = require('../utils/errors')

/**
 * Wajib Bearer access token admin MSI. Hasil decode disimpan di req.auth:
 * { sub: <admin_user id>, role: 'superadmin' | 'operator' | 'viewer', email }
 *
 * req.actorId = id admin, dipakai untuk kolom created_by / updated_by / deleted_by.
 */
const authenticate = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('UNAUTHORIZED'))
  }

  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] })
    if (payload.typ !== 'access') throw new Error('wrong token type')
    req.auth = payload
    req.actorId = payload.sub
    return next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(new AppError('TOKEN_EXPIRED'))
    return next(new AppError('UNAUTHORIZED'))
  }
}

/** Batasi endpoint untuk role tertentu, contoh: authorize('superadmin') */
const authorize = (...roles) => (req, res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    return next(new AppError('FORBIDDEN'))
  }
  return next()
}

/** viewer hanya boleh GET; operator & superadmin boleh menulis */
const canWrite = authorize('superadmin', 'operator')
const superadminOnly = authorize('superadmin')

const signAccessToken = (admin) => jwt.sign(
  {
    sub: admin.id, role: admin.role, email: admin.email, typ: 'access'
  },
  config.jwt.accessSecret,
  { algorithm: 'HS256', expiresIn: config.jwt.accessTtl }
)

module.exports = {
  authenticate, authorize, canWrite, superadminOnly, signAccessToken,
}

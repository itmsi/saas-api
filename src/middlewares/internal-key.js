const crypto = require('crypto')
const config = require('../config')
const { AppError } = require('../utils/errors')

const safeEqual = (a, b) => {
  if (!a || !b) return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

/**
 * Auth endpoint /internal/* dengan header X-Internal-Key.
 *
 *   INTERNAL_API_KEY           -> resolve biasa (role app)
 *   INTERNAL_PROVISIONING_KEY  -> resolve biasa + scope=provisioning (role owner)
 *
 * Hasil: req.internalScope = 'default' | 'provisioning'
 */
const internalKey = (req, res, next) => {
  const key = req.headers['x-internal-key']
  if (safeEqual(key, config.internal.provisioningKey)) {
    req.internalScope = 'provisioning'
    return next()
  }
  if (safeEqual(key, config.internal.apiKey)) {
    req.internalScope = 'default'
    return next()
  }
  return next(new AppError('INVALID_INTERNAL_KEY'))
}

const requireProvisioningKey = (req, res, next) => (
  req.internalScope === 'provisioning' ? next() : next(new AppError('FORBIDDEN'))
)

module.exports = { internalKey, requireProvisioningKey, safeEqual }

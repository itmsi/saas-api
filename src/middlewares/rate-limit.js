const rateLimit = require('express-rate-limit')
const config = require('../config')
const { AppError } = require('../utils/errors')

const limiter = (windowMs, max) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError('RATE_LIMITED')),
})

module.exports = {
  // Batas umum per IP untuk seluruh /api
  apiLimiter: limiter(60 * 1000, config.auth.rateLimitPerMinute),
  // Batas ketat untuk login & refresh (anti brute force)
  authLimiter: limiter(15 * 60 * 1000, config.auth.rateLimitAuthPer15Min),
}

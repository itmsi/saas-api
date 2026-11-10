const crypto = require('crypto')

/** Pakai X-Request-ID dari Kong jika ada, jika tidak buat baru. */
const requestId = (req, res, next) => {
  const incoming = req.headers['x-request-id']
  req.id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : crypto.randomUUID()
  res.setHeader('X-Request-ID', req.id)
  next()
}

module.exports = { requestId }

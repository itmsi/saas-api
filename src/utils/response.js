/**
 * Envelope sukses sesuai kontrak:
 * { "success": true, "data": ..., "meta": { "request_id": "...", ...meta } }
 */
const ok = (res, data = null, { meta, status = 200 } = {}) => {
  const body = { success: true, data, meta: { request_id: res.req?.id, ...(meta || {}) } }
  return res.status(status).json(body)
}

const created = (res, data, options = {}) => ok(res, data, { ...options, status: 201 })
const accepted = (res, data, options = {}) => ok(res, data, { ...options, status: 202 })

// Bungkus handler async agar error masuk ke error handler (Express 4)
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Bungkus semua handler controller sekaligus: module.exports = wrapAll({ list, create }) */
const wrapAll = (handlers) => Object.fromEntries(
  Object.entries(handlers).map(([name, fn]) => [name, asyncHandler(fn)])
)

/** Ambil page & limit dari query yang sudah divalidasi */
const pageOf = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  return { page, limit, offset: (page - 1) * limit }
}

const pageMeta = ({ page, limit }, total) => ({
  page, limit, total, total_pages: Math.ceil(total / limit),
})

module.exports = {
  ok, created, accepted, asyncHandler, wrapAll, pageOf, pageMeta,
}

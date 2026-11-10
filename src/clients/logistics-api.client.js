/**
 * HTTP client ke logistics-api (endpoint /internal).
 * Semua request memakai INTERNAL_PROVISIONING_KEY.
 *
 * Error dipetakan:
 *  - jaringan / timeout / 502 / 503 / 504 / 429 / 409 TENANT_LOCKED -> transient
 *  - selain itu (4xx, 500)                                         -> permanent
 */
const config = require('../config')
const { StepError, transient } = require('../lib/errors')
const { scrub } = require('../lib/audit')

const MAX_BODY_BYTES = 10 * 1024

/** Potong body maks 10 KB dan buang field rahasia sebelum disimpan di provisioning_steps */
const truncateBody = (body) => {
  if (body === undefined || body === null) return null
  const clean = typeof body === 'object' ? scrub(body) : body
  const text = typeof clean === 'string' ? clean : JSON.stringify(clean)
  if (text.length <= MAX_BODY_BYTES) return typeof clean === 'string' ? { raw: clean } : clean
  return { truncated: true, preview: text.slice(0, MAX_BODY_BYTES) }
}

const request = async (method, path, {
  body, timeoutMs = config.logisticsApi.defaultTimeoutMs, requestId, idempotencyKey,
} = {}) => {
  const url = `${config.logisticsApi.internalUrl}${path}`
  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Key': config.internal.provisioningKey,
  }
  if (requestId) headers['X-Request-ID'] = requestId
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const code = err.name === 'TimeoutError' ? 'TIMEOUT' : (err.cause?.code || err.name)
    throw transient(`logistics-api ${method} ${path} gagal: ${err.cause?.message || err.message}`, { code })
  }

  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch (e) { json = undefined }

  if (res.ok) return { status: res.status, body: json ?? text }

  const errCode = json?.error?.code
  const isTransient = [429, 502, 503, 504].includes(res.status) || (res.status === 409 && errCode === 'TENANT_LOCKED')
  throw new StepError(json?.error?.message || `logistics-api HTTP ${res.status}`, {
    transient: isTransient,
    code: errCode || `HTTP_${res.status}`,
    httpStatus: res.status,
    detail: json?.error?.detail || json?.error?.details,
    responseBody: truncateBody(json ?? text),
  })
}

const tenantPath = (clientId, suffix) => `/tenants/${encodeURIComponent(clientId)}/${suffix}`

module.exports = {
  truncateBody,
  migrate: (clientId, { target = 'latest', ...opts } = {}) => request('POST', tenantPath(clientId, 'migrate'), {
    body: { target }, timeoutMs: config.logisticsApi.migrateTimeoutMs, ...opts,
  }),
  seed: (clientId, opts = {}) => request('POST', tenantPath(clientId, 'seed'), {
    body: { include_system_user: true }, timeoutMs: config.logisticsApi.seedTimeoutMs, ...opts,
  }),
  verify: (clientId, opts = {}) => request('GET', tenantPath(clientId, 'verify'), {
    timeoutMs: config.logisticsApi.seedTimeoutMs, ...opts,
  }),
  resetSystemUser: (clientId, opts = {}) => request('POST', tenantPath(clientId, 'system-user/reset'), {
    body: {}, ...opts,
  }),
  migrationStatus: (opts = {}) => request('GET', '/migrations/status', { timeoutMs: 15000, ...opts }),
}

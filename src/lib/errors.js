/**
 * Klasifikasi error worker.
 *
 * Transient : retry di step yang sama (backoff 2s, 5s, 15s), tanpa rollback
 *             -> koneksi putus, timeout, ECONNREFUSED, logistics-api 502/503/504, 409 TENANT_LOCKED
 * Permanent : langsung rollback
 *             -> 4xx/500 dari logistics-api, permission denied, syntax error, dll
 */
class StepError extends Error {
  constructor(message, {
    transient = false, code, detail, httpStatus, responseBody, cause,
  } = {}) {
    super(message)
    this.name = transient ? 'TransientError' : 'PermanentError'
    this.transient = transient
    this.code = code
    this.detail = detail
    this.httpStatus = httpStatus
    this.responseBody = responseBody
    if (cause) this.cause = cause
  }
}

const transient = (message, opts = {}) => new StepError(message, { ...opts, transient: true })
const permanent = (message, opts = {}) => new StepError(message, { ...opts, transient: false })

const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT',
])

/**
 * Error Postgres yang aman di-retry:
 *  08xxx connection exception, 57P01-03 admin shutdown / crash / cannot connect now,
 *  53300 too many connections, 40001 serialization failure, 40P01 deadlock
 */
const isTransientPg = (err) => {
  const code = err?.code || ''
  return code.startsWith('08') || ['57P01', '57P02', '57P03', '53300', '40001', '40P01'].includes(code)
}

/** Ubah error apa pun menjadi StepError */
const classify = (err) => {
  if (err instanceof StepError) return err
  const code = err?.code || err?.cause?.code
  const isTransient = NETWORK_CODES.has(code)
    || isTransientPg(err)
    || err?.name === 'TimeoutError'
    || err?.name === 'AbortError'
    || /Connection terminated|timeout/i.test(err?.message || '')
  return new StepError(err?.message || String(err), {
    transient: isTransient,
    code,
    detail: err?.code ? { pg_code: err.code, ...(err.detail ? { pg_detail: err.detail } : {}) } : undefined,
    cause: err,
  })
}

module.exports = {
  StepError, transient, permanent, classify, isTransientPg,
}

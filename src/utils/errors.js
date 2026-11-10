/**
 * Error aplikasi. Lempar AppError dari service/controller, error handler
 * akan mengubahnya menjadi format kontrak:
 *
 * { "success": false, "error": { "code", "message", "http_status", "details" } }
 */

const ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  INVALID_REFRESH_TOKEN: 401,
  INVALID_INTERNAL_KEY: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  CLIENT_NOT_FOUND: 404,
  TENANT_NOT_ACTIVE: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  CLIENT_CODE_TAKEN: 409,
  EMAIL_TAKEN: 409,
  PLAN_CODE_TAKEN: 409,
  PLAN_IN_USE: 409,
  CLUSTER_NAME_TAKEN: 409,
  CLUSTER_IN_USE: 409,
  NO_CLUSTER_AVAILABLE: 409,
  CLUSTER_NOT_AVAILABLE: 409,
  JOB_ALREADY_RUNNING: 409,
  JOB_NOT_RETRYABLE: 409,
  CANNOT_DELETE_SELF: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,
}

class AppError extends Error {
  /**
   * @param {keyof ERROR_STATUS} code  kode error (lihat ERROR_STATUS)
   * @param {object} [options]
   * @param {string} [options.message]  pesan khusus; default diambil dari src/lang
   * @param {object|Array} [options.details]
   * @param {number} [options.httpStatus]
   */
  constructor(code, { message, details, httpStatus } = {}) {
    super(message || code)
    this.name = 'AppError'
    this.code = code
    this.customMessage = message
    this.details = details
    this.httpStatus = httpStatus || ERROR_STATUS[code] || 500
  }
}

module.exports = { AppError, ERROR_STATUS }

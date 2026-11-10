/**
 * Pesan error per bahasa, dipilih dari header Accept-Language (id | en).
 * Kunci = kode error di src/utils/errors.js.
 */
const config = require('../config')

const messages = {
  id: {
    BAD_REQUEST: 'Permintaan tidak valid.',
    VALIDATION_ERROR: 'Data tidak valid.',
    UNAUTHORIZED: 'Sesi berakhir, silakan masuk lagi.',
    TOKEN_EXPIRED: 'Sesi kedaluwarsa.',
    INVALID_CREDENTIALS: 'Email atau kata sandi salah.',
    INVALID_REFRESH_TOKEN: 'Refresh token tidak valid atau sudah dicabut.',
    INVALID_INTERNAL_KEY: 'Internal key tidak valid.',
    FORBIDDEN: 'Anda tidak punya akses untuk aksi ini.',
    NOT_FOUND: 'Data tidak ditemukan.',
    ROUTE_NOT_FOUND: 'Endpoint tidak ditemukan.',
    CLIENT_NOT_FOUND: 'Client tidak ditemukan.',
    TENANT_NOT_ACTIVE: 'Tenant tidak ditemukan atau tidak aktif.',
    CONFLICT: 'Data bentrok dengan kondisi saat ini.',
    INVALID_STATE: 'Aksi tidak bisa dilakukan pada status saat ini.',
    CLIENT_CODE_TAKEN: 'Kode client sudah dipakai.',
    EMAIL_TAKEN: 'Email sudah dipakai.',
    PLAN_CODE_TAKEN: 'Kode plan sudah dipakai.',
    PLAN_IN_USE: 'Plan masih dipakai subscription aktif.',
    CLUSTER_NAME_TAKEN: 'Nama cluster sudah dipakai.',
    CLUSTER_IN_USE: 'Cluster masih berisi tenant.',
    NO_CLUSTER_AVAILABLE: 'Tidak ada cluster aktif yang masih punya kapasitas.',
    CLUSTER_NOT_AVAILABLE: 'Cluster tidak aktif atau sudah penuh.',
    JOB_ALREADY_RUNNING: 'Masih ada job aktif untuk client ini.',
    JOB_NOT_RETRYABLE: 'Job ini tidak bisa diulang pada status saat ini.',
    CANNOT_DELETE_SELF: 'Tidak bisa menghapus / menonaktifkan akun sendiri.',
    PAYLOAD_TOO_LARGE: 'Ukuran request terlalu besar.',
    UNSUPPORTED_MEDIA_TYPE: 'Tipe konten tidak didukung.',
    RATE_LIMITED: 'Terlalu banyak permintaan, coba lagi nanti.',
    INTERNAL_ERROR: 'Terjadi kesalahan pada server.',
    UPSTREAM_ERROR: 'Layanan lain tidak merespons dengan benar.',
    SERVICE_UNAVAILABLE: 'Layanan sedang tidak tersedia.',
  },
  en: {
    BAD_REQUEST: 'Invalid request.',
    VALIDATION_ERROR: 'Invalid data.',
    UNAUTHORIZED: 'Session ended, please sign in again.',
    TOKEN_EXPIRED: 'Session expired.',
    INVALID_CREDENTIALS: 'Email or password is incorrect.',
    INVALID_REFRESH_TOKEN: 'Refresh token is invalid or revoked.',
    INVALID_INTERNAL_KEY: 'Invalid internal key.',
    FORBIDDEN: 'You are not allowed to perform this action.',
    NOT_FOUND: 'Data not found.',
    ROUTE_NOT_FOUND: 'Endpoint not found.',
    CLIENT_NOT_FOUND: 'Client not found.',
    TENANT_NOT_ACTIVE: 'Tenant not found or not active.',
    CONFLICT: 'Data conflicts with the current state.',
    INVALID_STATE: 'Action is not allowed in the current status.',
    CLIENT_CODE_TAKEN: 'Client code is already taken.',
    EMAIL_TAKEN: 'Email is already taken.',
    PLAN_CODE_TAKEN: 'Plan code is already taken.',
    PLAN_IN_USE: 'Plan is still used by an active subscription.',
    CLUSTER_NAME_TAKEN: 'Cluster name is already taken.',
    CLUSTER_IN_USE: 'Cluster still hosts tenants.',
    NO_CLUSTER_AVAILABLE: 'No active cluster with free capacity.',
    CLUSTER_NOT_AVAILABLE: 'Cluster is not active or is full.',
    JOB_ALREADY_RUNNING: 'There is already an active job for this client.',
    JOB_NOT_RETRYABLE: 'This job cannot be retried in its current status.',
    CANNOT_DELETE_SELF: 'You cannot delete or deactivate your own account.',
    PAYLOAD_TOO_LARGE: 'Request is too large.',
    UNSUPPORTED_MEDIA_TYPE: 'Unsupported content type.',
    RATE_LIMITED: 'Too many requests, please try again later.',
    INTERNAL_ERROR: 'An internal server error occurred.',
    UPSTREAM_ERROR: 'An upstream service returned an invalid response.',
    SERVICE_UNAVAILABLE: 'Service is unavailable.',
  },
}

const SUPPORTED = Object.keys(messages)

const resolveLocale = (acceptLanguage) => {
  if (!acceptLanguage) return config.app.defaultLanguage
  const candidates = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase().slice(0, 2))
  return candidates.find((c) => SUPPORTED.includes(c)) || config.app.defaultLanguage
}

const t = (code, locale = config.app.defaultLanguage) => (
  messages[locale]?.[code]
  ?? messages[config.app.defaultLanguage]?.[code]
  ?? code
)

module.exports = { t, resolveLocale, SUPPORTED }

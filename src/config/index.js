const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const str = (key, fallback = '') => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}
const num = (key, fallback) => {
  const value = Number(process.env[key])
  return Number.isFinite(value) && process.env[key] !== '' && process.env[key] !== undefined ? value : fallback
}
const bool = (key, fallback = false) => {
  const value = process.env[key]
  if (value === undefined || value === '') return fallback
  return ['true', '1', 'yes'].includes(value.toLowerCase())
}
const list = (key, fallback = []) => {
  const value = process.env[key]
  if (!value) return fallback
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

const env = str('NODE_ENV', 'development')
const isProduction = env === 'production'

// DATABASE_URL diutamakan; jika kosong pakai DB_* terpisah
const dbConnection = str('DATABASE_URL')
  ? { connectionString: str('DATABASE_URL'), ssl: bool('DB_SSL', false) ? { rejectUnauthorized: false } : false }
  : {
    host: str('DB_HOST', 'localhost'),
    port: num('DB_PORT', 5432),
    user: str('DB_USER', 'postgres'),
    password: str('DB_PASSWORD', ''),
    database: str('DB_NAME', 'saas_core'),
    ssl: bool('DB_SSL', false) ? { rejectUnauthorized: false } : false,
  }

const config = {
  app: {
    name: str('APP_NAME', 'logistics-saas-api'),
    env,
    isProduction,
    port: num('PORT', num('APP_PORT', 9061)),
    timezone: str('TZ', 'Asia/Jakarta'),
    jsonLimit: str('JSON_LIMIT', '1mb'),
    corsOrigins: list('CORS_ORIGINS', ['*']),
    defaultLanguage: str('DEFAULT_LANGUAGE', 'id'),
    swaggerEnabled: bool('SWAGGER_ENABLED', !isProduction),
  },

  db: {
    client: 'pg',
    connection: { ...dbConnection, application_name: str('DB_APPLICATION_NAME', 'logistics-saas-api') },
    pool: {
      min: num('DB_POOL_MIN', 0),
      max: num('DB_POOL_MAX', 10),
    },
  },

  rabbitmq: {
    url: str('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
    exchange: 'tenant',
    deadLetterExchange: 'tenant.dlx',
  },

  redis: {
    url: str('REDIS_URL', 'redis://localhost:6379/0'),
    tenantTtlSeconds: num('TENANT_CACHE_TTL_SECONDS', 600),
    invalidateChannel: 'tenant-invalidate',
  },

  jwt: {
    accessSecret: str('JWT_ACCESS_SECRET'),
    accessTtl: str('JWT_ACCESS_TTL', '15m'),
    refreshTtl: str('JWT_REFRESH_TTL', '7d'),
  },

  auth: {
    bcryptRounds: num('BCRYPT_ROUNDS', 12),
    rateLimitPerMinute: num('RATE_LIMIT_PER_MINUTE', 300),
    rateLimitAuthPer15Min: num('RATE_LIMIT_AUTH_PER_15MIN', 20),
  },

  internal: {
    apiKey: str('INTERNAL_API_KEY'),
    provisioningKey: str('INTERNAL_PROVISIONING_KEY'),
  },

  tenantDb: {
    encKey: str('TENANT_DB_ENC_KEY'),
    encKeyVersion: num('TENANT_DB_ENC_KEY_VERSION', 1),
    defaultSystemUser: str('TENANT_SYSTEM_USERNAME', 'msi.support'),
    defaultPoolMax: num('TENANT_DB_POOL_MAX', 5),
    appConnectionLimit: num('TENANT_DB_APP_CONNECTION_LIMIT', 20),
  },

  logisticsApi: {
    internalUrl: str('LOGISTICS_API_INTERNAL_URL', 'http://localhost:4000/internal').replace(/\/$/, ''),
    migrateTimeoutMs: num('LOGISTICS_MIGRATE_TIMEOUT_MS', 600000),
    seedTimeoutMs: num('LOGISTICS_SEED_TIMEOUT_MS', 120000),
    defaultTimeoutMs: num('LOGISTICS_DEFAULT_TIMEOUT_MS', 120000),
  },

  worker: {
    id: str('WORKER_ID', 'saas-worker-1'),
    healthPort: num('WORKER_HEALTH_PORT', 3100),
    // URL worker dilihat dari proses API (untuk test-connection cluster)
    internalUrl: str('WORKER_INTERNAL_URL', 'http://localhost:3100').replace(/\/$/, ''),
    outboxPollIntervalMs: num('OUTBOX_POLL_INTERVAL_MS', 1000),
    outboxBatchSize: num('OUTBOX_BATCH_SIZE', 50),
    rollbackOnFailure: bool('ROLLBACK_ON_FAILURE', true),
    transientRetryMax: num('TRANSIENT_RETRY_MAX', 3),
    transientBackoffMs: list('TRANSIENT_BACKOFF_MS', ['2000', '5000', '15000']).map(Number),
    shutdownTimeoutMs: num('WORKER_SHUTDOWN_TIMEOUT_MS', 600000),
    interruptedAfterMs: num('WORKER_INTERRUPTED_AFTER_MS', 15 * 60 * 1000),
    lockRetryDelayMs: num('WORKER_LOCK_RETRY_DELAY_MS', 5000),
    backupDir: str('BACKUP_DIR', '/backups'),
    pgDumpPath: str('PG_DUMP_PATH', 'pg_dump'), // versi pg_dump harus >= versi server Postgres
  },
}

const required = (value, name) => {
  if (!value) throw new Error(`${name} wajib diisi saat NODE_ENV=production`)
}

if (isProduction) {
  required(config.jwt.accessSecret, 'JWT_ACCESS_SECRET')
  required(config.tenantDb.encKey, 'TENANT_DB_ENC_KEY')
  required(config.internal.apiKey, 'INTERNAL_API_KEY')
  required(config.internal.provisioningKey, 'INTERNAL_PROVISIONING_KEY')
}
if (!config.jwt.accessSecret) config.jwt.accessSecret = 'dev-only-insecure-secret'

module.exports = config

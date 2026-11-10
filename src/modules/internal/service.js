/**
 * Resolve tenant untuk logistics-api.
 *
 * scope=default      : hanya tenant active, return role app, di-cache Redis 10 menit
 * scope=provisioning : boleh status provisioning, return role owner + system user, TIDAK di-cache
 */
const db = require('../../database')
const { alive } = require('../../database')
const { AppError } = require('../../utils/errors')
const cache = require('../../lib/cache')

const CURRENT_SUBSCRIPTION = ['trial', 'active', 'past_due']
const PROVISIONING_STATUSES = ['provisioning', 'provisioning_failed', 'active', 'suspended']

/** @param {{ code?: string, id?: string }} key */
const loadTenant = async ({ code, id }) => {
  const q = alive(db('clients as c'), 'c')
    .join('tenant_db_configs as t', function joinConfig() {
      this.on('t.client_id', 'c.id').andOn('t.is_deleted', db.raw('false'))
    })
    .join('db_clusters as k', 'k.id', 't.cluster_id')
    .select(
      'c.id as client_id',
      'c.client_code',
      'c.name',
      'c.status',
      'c.settings',
      't.*',
      'k.host',
      'k.port',
      'k.pooler_host',
      'k.pooler_port',
    )
  if (code) q.where('c.client_code', code)
  else q.where('c.id', id)
  const row = await q.first()
  if (!row) return null

  const sub = await alive(db('subscriptions as s'), 's')
    .join('plans as p', 'p.id', 's.plan_id')
    .where('s.client_id', row.client_id)
    .whereIn('s.status', CURRENT_SUBSCRIPTION)
    .first('s.status', 's.end_date', 's.trial_end_date', 'p.code as plan_code', 'p.features', 'p.max_users', 'p.max_shipments_per_month')
  return { row, sub }
}

const toDefault = ({ row, sub }) => ({
  client_id: row.client_id,
  client_code: row.client_code,
  name: row.name,
  status: row.status,
  settings: row.settings,
  subscription: sub ? {
    status: sub.status, plan_code: sub.plan_code, end_date: sub.end_date, trial_end_date: sub.trial_end_date,
  } : null,
  features: sub?.features || {},
  limits: sub ? { max_users: sub.max_users, max_shipments_per_month: sub.max_shipments_per_month } : {},
  // Role app lewat pooler (jika ada)
  db: {
    host: row.pooler_host || row.host,
    port: row.pooler_port || row.port,
    database: row.db_name,
    username: row.db_app_username,
    password_enc: row.db_app_password_enc,
    key_version: row.encryption_key_version,
    pool_max: row.pool_max,
  },
  schema_version: row.schema_version,
})

const toProvisioning = (data) => ({
  ...toDefault(data),
  // Owner langsung ke Postgres (bukan PgBouncer transaction mode): migrasi pakai advisory lock & DDL
  db_owner: {
    host: data.row.host,
    port: data.row.port,
    database: data.row.db_name,
    username: data.row.db_owner_username,
    password_enc: data.row.db_owner_password_enc,
    key_version: data.row.encryption_key_version,
  },
  system_user: {
    username: data.row.system_user_username,
    password_enc: data.row.system_user_password_enc,
    key_version: data.row.encryption_key_version,
  },
})

/**
 * @param {{ code?: string, id?: string }} key
 * @param {'default'|'provisioning'} scope
 * @param {'default'|'provisioning'} keyScope  scope dari X-Internal-Key yang dipakai
 * @returns {Promise<{ tenant: object, cache: 'hit'|'miss'|'bypass' }>}
 */
const resolve = async (key, scope, keyScope) => {
  if (scope === 'provisioning') {
    if (keyScope !== 'provisioning') throw new AppError('FORBIDDEN')
    const data = await loadTenant(key)
    if (!data || !PROVISIONING_STATUSES.includes(data.row.status) || data.row.dropped_at) {
      throw new AppError('TENANT_NOT_ACTIVE')
    }
    return { tenant: toProvisioning(data), cache: 'bypass' }
  }

  const cached = await cache.getTenant(key)
  if (cached) return { tenant: cached, cache: 'hit' }

  const data = await loadTenant(key)
  if (!data || data.row.status !== 'active') throw new AppError('TENANT_NOT_ACTIVE')
  const tenant = toDefault(data)
  await cache.setTenant(tenant)
  return { tenant, cache: 'miss' }
}

module.exports = { resolve }

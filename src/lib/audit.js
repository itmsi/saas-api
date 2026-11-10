/**
 * Catat aksi admin & worker ke audit_logs.
 * Field rahasia (password, *_enc, token) selalu dibuang sebelum disimpan.
 */
const db = require('../database')
const logger = require('../utils/logger')

const SECRET_PATTERN = /(password|_enc$|token|secret)/i

const scrub = (data) => {
  if (!data || typeof data !== 'object') return data ?? null
  if (Array.isArray(data)) return data.map(scrub)
  return Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => !SECRET_PATTERN.test(k))
      .map(([k, v]) => [k, v && typeof v === 'object' && !(v instanceof Date) ? scrub(v) : v])
  )
}

/**
 * @param {object} entry
 * @param {'admin'|'system'|'worker'|'logistics-api'} entry.actorType
 * @param {string} [entry.actorId]
 * @param {string} entry.action        contoh: client.create, client.suspend
 * @param {string} [entry.targetType]  contoh: client
 * @param {string} [entry.targetId]
 * @param {object} [entry.before]
 * @param {object} [entry.after]
 * @param {{ ip?: string, id?: string }} [entry.ctx]  konteks request (utils/context.ctxOf) — `req` juga diterima
 * @param {import('knex').Knex} [entry.trx]
 */
const record = async ({
  actorType = 'admin', actorId, action, targetType, targetId, before, after, ctx, req, trx,
}) => {
  const source = ctx || req
  const adminId = actorType === 'admin' ? actorId : null
  const row = {
    actor_type: actorType,
    actor_id: actorId ? String(actorId) : null,
    action,
    target_type: targetType || null,
    target_id: targetId ? String(targetId) : null,
    before_data: before ? JSON.stringify(scrub(before)) : null,
    after_data: after ? JSON.stringify(scrub(after)) : null,
    ip_address: source?.ip?.slice(0, 45) || null,
    request_id: source?.id || null,
    created_by: adminId,
    updated_by: adminId,
  }
  try {
    await (trx || db)('audit_logs').insert(row)
  } catch (err) {
    // Jika di dalam transaksi, biarkan transaksi gagal; jika tidak, cukup log
    if (trx) throw err
    logger.error(`Audit log gagal (${action}): ${err.message}`)
  }
}

/** Shortcut untuk aksi admin: fromRequest(ctx, 'plan.update', { type: 'plan', id }, { before, after }) */
const fromRequest = (ctx, action, target = {}, extra = {}) => record({
  actorType: 'admin',
  actorId: ctx.actorId,
  action,
  targetType: target.type,
  targetId: target.id,
  ctx,
  ...extra,
})

module.exports = { record, fromRequest, scrub }

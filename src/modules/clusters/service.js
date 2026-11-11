const config = require('../../config')
const db = require('../../database')
const { stamp, alive, publicRow } = require('../../database')
const { AppError } = require('../../utils/errors')
const audit = require('../../lib/audit')

const withCapacity = (row) => ({
  ...publicRow(row),
  free_slots: Math.max(0, row.max_tenants - row.tenant_count),
  usage_percent: row.max_tenants ? Math.round((row.tenant_count / row.max_tenants) * 100) : 0,
})

const findOr404 = async (id) => {
  const row = await alive(db('db_clusters')).where({ id }).first()
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

const assertNameFree = async (name, exceptId) => {
  const q = alive(db('db_clusters')).where({ name })
  if (exceptId) q.whereNot({ id: exceptId })
  if (await q.first('id')) throw new AppError('CLUSTER_NAME_TAKEN')
}

/** Hanya satu cluster default: lepas default lama sebelum menyimpan yang baru */
const clearDefault = (trx, body, exceptId) => (body.is_default
  ? alive(trx('db_clusters')).where({ is_default: true }).whereNot({ id: exceptId || null }).update({ is_default: false })
  : null)

const list = async ({ status }) => {
  const q = alive(db('db_clusters')).orderBy('name')
  if (status) q.where({ status })
  return (await q).map(withCapacity)
}

const detail = async (id) => withCapacity(await findOr404(id))

const create = async (body, ctx) => {
  await assertNameFree(body.name)
  const [row] = await db.transaction(async (trx) => {
    await clearDefault(trx, body)
    return trx('db_clusters').insert(stamp.create(body, ctx.actorId)).returning('*')
  })
  await audit.fromRequest(ctx, 'cluster.create', { type: 'cluster', id: row.id }, { after: row })
  return withCapacity(row)
}

const update = async (id, body, ctx) => {
  const before = await findOr404(id)
  if (body.name) await assertNameFree(body.name, id)
  const [row] = await db.transaction(async (trx) => {
    await clearDefault(trx, body, id)
    return trx('db_clusters').where({ id }).update(stamp.update(body, ctx.actorId)).returning('*')
  })
  await audit.fromRequest(ctx, 'cluster.update', { type: 'cluster', id }, { before, after: row })
  return withCapacity(row)
}

/** Soft delete; hanya jika tidak ada tenant */
const remove = async (id, ctx) => {
  const before = await findOr404(id)
  const used = await alive(db('tenant_db_configs')).where({ cluster_id: id }).whereNull('dropped_at').first('id')
  if (before.tenant_count > 0 || used) throw new AppError('CLUSTER_IN_USE')
  await db('db_clusters').where({ id }).update(stamp.remove(ctx.actorId))
  await audit.fromRequest(ctx, 'cluster.delete', { type: 'cluster', id }, { before })
  return { id, deleted: true }
}

/**
 * Tes koneksi role provisioner. Kredensial provisioner hanya ada di saas-worker,
 * jadi permintaan diteruskan ke health server worker (jaringan internal).
 */
const testConnection = async (id, ctx) => {
  await findOr404(id)
  let response
  try {
    response = await fetch(`${config.worker.internalUrl}/clusters/${id}/test-connection`, {
      method: 'POST',
      headers: { 'X-Internal-Key': config.internal.provisioningKey, 'X-Request-ID': ctx.id },
      signal: AbortSignal.timeout(20000),
    })
  } catch (err) {
    throw new AppError('SERVICE_UNAVAILABLE', { details: { reason: 'worker_unreachable', message: err.cause?.message || err.message } })
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new AppError('UPSTREAM_ERROR', { details: body })
  await audit.fromRequest(ctx, 'cluster.test_connection', { type: 'cluster', id }, { after: body })
  return body
}

module.exports = {
  list, detail, create, update, remove, testConnection,
}

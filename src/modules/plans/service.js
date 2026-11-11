const db = require('../../database')
const { stamp, alive, publicRow } = require('../../database')
const { AppError } = require('../../utils/errors')
const audit = require('../../lib/audit')
const cache = require('../../lib/cache')

const CURRENT_SUBSCRIPTION = ['trial', 'active', 'past_due']

const findOr404 = async (id) => {
  const row = await alive(db('plans')).where({ id }).first()
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

/** Client yang subscription-nya sedang memakai plan ini */
const clientsOnPlan = (planId) => alive(db('subscriptions as s'), 's')
  .join('clients as c', 'c.id', 's.client_id')
  .where('s.plan_id', planId)
  .whereIn('s.status', CURRENT_SUBSCRIPTION)
  .select('c.id as client_id', 'c.client_code')

/** Hanya satu plan default: lepas default lama sebelum menyimpan yang baru */
const clearDefault = (trx, body, exceptId) => (body.is_default
  ? alive(trx('plans')).where({ is_default: true }).whereNot({ id: exceptId || null }).update({ is_default: false })
  : null)

const toRow = (body) => (body.features ? { ...body, features: JSON.stringify(body.features) } : { ...body })

const list = async ({ is_active: isActive }) => {
  const q = alive(db('plans')).orderBy('price_monthly').orderBy('code')
  if (isActive !== undefined) q.where({ is_active: isActive })
  return (await q).map(publicRow)
}

const detail = async (id) => publicRow(await findOr404(id))

const create = async (body, ctx) => {
  if (await alive(db('plans')).where({ code: body.code }).first('id')) throw new AppError('PLAN_CODE_TAKEN')
  const [row] = await db.transaction(async (trx) => {
    await clearDefault(trx, body)
    return trx('plans').insert(stamp.create(toRow(body), ctx.actorId)).returning('*')
  })
  await audit.fromRequest(ctx, 'plan.create', { type: 'plan', id: row.id }, { after: row })
  return publicRow(row)
}

/** Feature flag / limit berubah -> invalidasi cache semua tenant di plan ini */
const update = async (id, body, ctx) => {
  const before = await findOr404(id)
  const [row] = await db.transaction(async (trx) => {
    await clearDefault(trx, body, id)
    return trx('plans').where({ id }).update(stamp.update(toRow(body), ctx.actorId)).returning('*')
  })

  const clients = await clientsOnPlan(id)
  await Promise.all(clients.map((c) => cache.invalidateTenant(c, 'plan_updated')))

  await audit.fromRequest(ctx, 'plan.update', { type: 'plan', id }, { before, after: row })
  return { row: publicRow(row), invalidatedTenants: clients.length }
}

/** Soft delete; ditolak jika masih dipakai subscription aktif */
const remove = async (id, ctx) => {
  const before = await findOr404(id)
  if (await clientsOnPlan(id).first()) throw new AppError('PLAN_IN_USE')
  await db('plans').where({ id }).update(stamp.remove(ctx.actorId))
  await audit.fromRequest(ctx, 'plan.delete', { type: 'plan', id }, { before })
  return { id, deleted: true }
}

module.exports = {
  list, detail, create, update, remove,
}

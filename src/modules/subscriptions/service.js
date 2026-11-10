const db = require('../../database')
const { stamp, alive, publicRow } = require('../../database')
const { AppError } = require('../../utils/errors')
const audit = require('../../lib/audit')
const cache = require('../../lib/cache')

const CURRENT = ['trial', 'active', 'past_due']

const getClient = async (id, trx = db) => {
  const client = await alive(trx('clients')).where({ id }).first('id', 'client_code', 'status')
  if (!client) throw new AppError('CLIENT_NOT_FOUND')
  return client
}

const invalidate = (client, reason) => cache.invalidateTenant({ client_id: client.id, client_code: client.client_code }, reason)

/** Histori subscription client */
const listByClient = async (clientId) => {
  await getClient(clientId)
  const rows = await alive(db('subscriptions as s'), 's')
    .join('plans as p', 'p.id', 's.plan_id')
    .where('s.client_id', clientId)
    .select('s.*', 'p.code as plan_code', 'p.name as plan_name')
    .orderBy('s.start_date', 'desc')
    .orderBy('s.created_at', 'desc')
  return rows.map(publicRow)
}

/** Buat / ganti subscription: subscription yang sedang berjalan di-cancel */
const create = async (clientId, body, ctx) => {
  const { client, row, replaced } = await db.transaction(async (trx) => {
    const c = await getClient(clientId, trx)
    await trx('clients').where({ id: clientId }).forUpdate().first('id')

    const plan = await alive(trx('plans')).where({ code: body.plan_code, is_active: true }).first()
    if (!plan) throw new AppError('VALIDATION_ERROR', { details: [{ field: 'plan_code', message: 'Plan tidak ditemukan / tidak aktif' }] })

    const current = await alive(trx('subscriptions')).where({ client_id: clientId }).whereIn('status', CURRENT)
    if (current.length) {
      await trx('subscriptions').whereIn('id', current.map((s) => s.id)).update(stamp.update({
        status: 'cancelled', end_date: body.start_date,
      }, ctx.actorId))
    }

    const [inserted] = await trx('subscriptions').insert(stamp.create({
      client_id: clientId,
      plan_id: plan.id,
      status: body.status,
      start_date: body.start_date,
      end_date: body.end_date || null,
      trial_end_date: body.trial_end_date || null,
      auto_renew: body.auto_renew,
      notes: body.notes || null,
    }, ctx.actorId)).returning('*')

    await audit.record({
      actorType: 'admin',
      actorId: ctx.actorId,
      action: 'subscription.create',
      targetType: 'client',
      targetId: clientId,
      before: current.length ? { subscription_ids: current.map((s) => s.id) } : null,
      after: { ...inserted, plan_code: plan.code },
      ctx,
      trx,
    })
    return { client: c, row: { ...inserted, plan_code: plan.code, plan_name: plan.name }, replaced: current.map((s) => s.id) }
  })

  await invalidate(client, 'subscription_changed')
  return { row: publicRow(row), cancelledIds: replaced }
}

/** Ubah status / tanggal subscription */
const update = async (id, body, ctx) => {
  const before = await alive(db('subscriptions')).where({ id }).first()
  if (!before) throw new AppError('NOT_FOUND')
  const [row] = await db('subscriptions').where({ id }).update(stamp.update(body, ctx.actorId)).returning('*')
  const client = await getClient(before.client_id)
  await invalidate(client, 'subscription_changed')
  await audit.fromRequest(ctx, 'subscription.update', { type: 'client', id: before.client_id }, { before, after: row })
  return publicRow(row)
}

module.exports = { listByClient, create, update }

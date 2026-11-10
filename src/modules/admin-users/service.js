const bcrypt = require('bcrypt')
const config = require('../../config')
const db = require('../../database')
const { stamp, alive } = require('../../database')
const { AppError } = require('../../utils/errors')
const { pageOf, pageMeta } = require('../../utils/response')
const audit = require('../../lib/audit')
const { PROFILE_COLUMNS } = require('../auth/service')

const COLUMNS = [...PROFILE_COLUMNS, 'created_by', 'updated_by']

const findOr404 = async (id) => {
  const row = await alive(db('admin_users')).where({ id }).first(COLUMNS)
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

const assertEmailFree = async (email, exceptId) => {
  const q = alive(db('admin_users')).whereRaw('lower(email) = ?', [email.toLowerCase()])
  if (exceptId) q.whereNot({ id: exceptId })
  if (await q.first('id')) throw new AppError('EMAIL_TAKEN')
}

/** Cabut semua sesi admin (dipakai saat nonaktif / reset password / hapus) */
const revokeAllTokens = (adminId, actorId) => db('admin_refresh_tokens')
  .where({ admin_user_id: adminId }).whereNull('revoked_at')
  .update(stamp.update({ revoked_at: db.fn.now() }, actorId))

const list = async (query) => {
  const p = pageOf(query)
  const base = alive(db('admin_users'))
  if (query.search) base.where((w) => w.whereILike('email', `%${query.search}%`).orWhereILike('name', `%${query.search}%`))
  if (query.role) base.where({ role: query.role })
  if (query.is_active !== undefined) base.where({ is_active: query.is_active })

  const [{ count }] = await base.clone().count({ count: '*' })
  const rows = await base.select(COLUMNS).orderBy('created_at', 'desc').limit(p.limit).offset(p.offset)
  return { rows, meta: pageMeta(p, Number(count)) }
}

const detail = (id) => findOr404(id)

const create = async (body, ctx) => {
  const email = body.email.toLowerCase()
  await assertEmailFree(email)
  const [row] = await db('admin_users').insert(stamp.create({
    email,
    name: body.name,
    role: body.role,
    password_hash: await bcrypt.hash(body.password, config.auth.bcryptRounds),
  }, ctx.actorId)).returning(COLUMNS)
  await audit.fromRequest(ctx, 'admin_user.create', { type: 'admin_user', id: row.id }, { after: row })
  return row
}

const update = async (id, body, ctx) => {
  const before = await findOr404(id)
  // superadmin tidak boleh menonaktifkan / menurunkan role dirinya sendiri
  if (id === ctx.actorId && (body.is_active === false || (body.role && body.role !== 'superadmin'))) {
    throw new AppError('CANNOT_DELETE_SELF')
  }
  const data = { ...body }
  if (data.email) {
    data.email = data.email.toLowerCase()
    await assertEmailFree(data.email, id)
  }
  const [row] = await db('admin_users').where({ id }).update(stamp.update(data, ctx.actorId)).returning(COLUMNS)
  if (data.is_active === false) await revokeAllTokens(id, ctx.actorId)
  await audit.fromRequest(ctx, 'admin_user.update', { type: 'admin_user', id }, { before, after: row })
  return row
}

const resetPassword = async (id, { password }, ctx) => {
  await findOr404(id)
  await db('admin_users').where({ id }).update(stamp.update({
    password_hash: await bcrypt.hash(password, config.auth.bcryptRounds),
  }, ctx.actorId))
  await revokeAllTokens(id, ctx.actorId)
  await audit.fromRequest(ctx, 'admin_user.reset_password', { type: 'admin_user', id })
  return { id, password_reset: true }
}

/** Soft delete */
const remove = async (id, ctx) => {
  if (id === ctx.actorId) throw new AppError('CANNOT_DELETE_SELF')
  const before = await findOr404(id)
  await db('admin_users').where({ id }).update(stamp.remove(ctx.actorId))
  await revokeAllTokens(id, ctx.actorId)
  await audit.fromRequest(ctx, 'admin_user.delete', { type: 'admin_user', id }, { before })
  return { id, deleted: true }
}

module.exports = {
  list, detail, create, update, resetPassword, remove,
}

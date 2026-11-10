const knex = require('knex')
const knexfile = require('./knexfile')
const { COL } = require('./columns')

// Koneksi dibuat lazy: aplikasi tetap bisa start walau DB belum siap,
// status DB dilaporkan lewat GET /health/ready.
const db = knex(knexfile)

/*
 * Helper kolom standar. Semua repository WAJIB memakai helper ini supaya
 * created_by / updated_by / deleted_by / is_deleted terisi konsisten.
 *
 *   db('plans').insert(stamp.create({ code: 'pro' }, actorId))
 *   db('plans').where({ id }).update(stamp.update({ name }, actorId))
 *   db('plans').where({ id }).update(stamp.remove(actorId))
 *   alive(db('plans'))                  // where is_deleted = false
 *   alive(db('clients as c'), 'c')      // dengan alias
 */
const stamp = {
  create: (data, actorId = null) => ({ ...data, [COL.createdBy]: actorId, [COL.updatedBy]: actorId }),
  update: (data, actorId = null) => ({ ...data, [COL.updatedBy]: actorId }),
  remove: (actorId = null) => ({
    [COL.isDeleted]: true,
    [COL.deletedAt]: db.fn.now(),
    [COL.deletedBy]: actorId,
    [COL.updatedBy]: actorId,
  }),
}

const alive = (qb, alias) => qb.where(alias ? `${alias}.${COL.isDeleted}` : COL.isDeleted, false)

/** Hapus kolom standar internal dari object sebelum dikirim ke client API */
const HIDDEN_COLUMNS = [COL.isDeleted, COL.deletedAt, COL.deletedBy]
const publicRow = (row) => {
  if (!row) return row
  const out = { ...row }
  HIDDEN_COLUMNS.forEach((c) => delete out[c])
  return out
}

module.exports = db
module.exports.stamp = stamp
module.exports.alive = alive
module.exports.publicRow = publicRow

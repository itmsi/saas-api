/**
 * Standar kolom tabel saas_core.
 *
 * SETIAP tabel wajib punya:
 *   created_at, created_by, updated_at, updated_by,
 *   is_deleted (boolean), deleted_at, deleted_by
 *
 * - *_by berisi id admin_users (UUID). NULL = dilakukan oleh sistem / worker.
 * - Data tidak pernah dihapus fisik oleh aplikasi: hapus = soft delete
 *   (is_deleted = true + deleted_at + deleted_by).
 * - updated_at diisi otomatis oleh trigger set_updated_at().
 *
 * Nama kolom dikumpulkan di sini supaya mudah diganti di satu tempat.
 */
const COL = {
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  isDeleted: 'is_deleted',
  deletedAt: 'deleted_at',
  deletedBy: 'deleted_by',
}

/** Dipakai di migrasi: t => standardColumns(knex, t) */
const standardColumns = (knex, t) => {
  t.timestamp(COL.createdAt, { useTz: true }).notNullable().defaultTo(knex.fn.now())
  t.uuid(COL.createdBy).nullable()
  t.timestamp(COL.updatedAt, { useTz: true }).notNullable().defaultTo(knex.fn.now())
  t.uuid(COL.updatedBy).nullable()
  t.boolean(COL.isDeleted).notNullable().defaultTo(false)
  t.timestamp(COL.deletedAt, { useTz: true }).nullable()
  t.uuid(COL.deletedBy).nullable()
}

/** Trigger updated_at untuk satu tabel (fungsi dibuat di migrasi pertama) */
const updatedAtTrigger = (table) => `
  CREATE TRIGGER trg_${table}_updated_at
  BEFORE UPDATE ON ${table}
  FOR EACH ROW EXECUTE FUNCTION set_updated_at()
`

module.exports = { COL, standardColumns, updatedAtTrigger }

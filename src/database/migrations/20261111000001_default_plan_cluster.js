/**
 * Plan & cluster default.
 * Dipakai POST /clients saat plan_code / cluster_id tidak diisi.
 * Maksimal satu default per tabel (unique index parsial).
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('plans', (t) => {
    t.boolean('is_default').notNullable().defaultTo(false)
  })
  await knex.schema.alterTable('db_clusters', (t) => {
    t.boolean('is_default').notNullable().defaultTo(false)
  })
  await knex.raw('CREATE UNIQUE INDEX uq_plans_default ON plans (is_default) WHERE is_default = true AND is_deleted = false')
  await knex.raw('CREATE UNIQUE INDEX uq_db_clusters_default ON db_clusters (is_default) WHERE is_default = true AND is_deleted = false')
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_plans_default')
  await knex.raw('DROP INDEX IF EXISTS uq_db_clusters_default')
  await knex.schema.alterTable('plans', (t) => { t.dropColumn('is_default') })
  await knex.schema.alterTable('db_clusters', (t) => { t.dropColumn('is_default') })
}

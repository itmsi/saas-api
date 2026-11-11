/**
 * Cluster default (is_default = true). Dipakai POST /clients saat cluster_id tidak diisi.
 * Dibaca dari env:
 *   SEED_CLUSTER_NAME        (default: default)
 *   SEED_CLUSTER_HOST        (default: localhost)
 *   SEED_CLUSTER_PORT        (default: 5432)
 *   SEED_CLUSTER_SECRET_REF  (default: CLUSTER_DEFAULT) -> worker membaca CLUSTER_DEFAULT_USER / _PASSWORD
 *   SEED_CLUSTER_MAX_TENANTS (default: 100)
 *   SEED_CLUSTER_POOLER_HOST, SEED_CLUSTER_POOLER_PORT (opsional)
 * Aman dijalankan ulang: tidak menimpa cluster yang sudah ada.
 */
exports.seed = async (knex) => {
  const { env } = process
  const name = env.SEED_CLUSTER_NAME || 'default'

  const exists = await knex('db_clusters').where({ name, is_deleted: false }).first('id')
  if (exists) {
    console.log(`[seed] cluster ${name} sudah ada`)
    return
  }

  const hasDefault = await knex('db_clusters').where({ is_default: true, is_deleted: false }).first('id')
  await knex('db_clusters').insert({
    name,
    host: env.SEED_CLUSTER_HOST || 'localhost',
    port: Number(env.SEED_CLUSTER_PORT) || 5432,
    pooler_host: env.SEED_CLUSTER_POOLER_HOST || null,
    pooler_port: Number(env.SEED_CLUSTER_POOLER_PORT) || null,
    admin_secret_ref: env.SEED_CLUSTER_SECRET_REF || 'CLUSTER_DEFAULT',
    max_tenants: Number(env.SEED_CLUSTER_MAX_TENANTS) || 100,
    status: 'active',
    is_default: !hasDefault,
  })
  console.log(`[seed] cluster ${name} dibuat${hasDefault ? '' : ' (default)'}`)
}

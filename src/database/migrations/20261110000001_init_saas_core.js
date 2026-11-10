/**
 * Skema awal DB saas_core (control plane).
 * Semua tabel memakai kolom standar dari ../columns.js:
 *   created_at, created_by, updated_at, updated_by, is_deleted, deleted_at, deleted_by
 *
 * Unique index dibuat PARSIAL (WHERE is_deleted = false) agar data yang sudah
 * di-soft-delete tidak menghalangi data baru dengan nilai sama.
 */
const { standardColumns, updatedAtTrigger } = require('../columns')

const TABLES = [
  'admin_users', 'admin_refresh_tokens', 'plans', 'db_clusters', 'clients', 'subscriptions',
  'tenant_db_configs', 'migration_rollouts', 'provisioning_jobs', 'provisioning_steps',
  'outbox_events', 'audit_logs',
]

exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `)

  const uuidPk = (t) => t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
  const tz = (t, name) => t.timestamp(name, { useTz: true })

  // ===== Admin MSI =====
  await knex.schema.createTable('admin_users', (t) => {
    uuidPk(t)
    t.string('email', 150).notNullable()
    t.string('name', 150).notNullable()
    t.string('password_hash', 255).notNullable()
    t.string('role', 30).notNullable().defaultTo('operator') // superadmin | operator | viewer
    t.boolean('is_active').notNullable().defaultTo(true)
    tz(t, 'last_login_at')
    standardColumns(knex, t)
  })
  await knex.raw('CREATE UNIQUE INDEX uq_admin_users_email ON admin_users (lower(email)) WHERE is_deleted = false')

  await knex.schema.createTable('admin_refresh_tokens', (t) => {
    uuidPk(t)
    t.uuid('admin_user_id').notNullable().references('id').inTable('admin_users')
      .onDelete('CASCADE')
    t.string('token_hash', 255).notNullable()
    tz(t, 'expires_at').notNullable()
    tz(t, 'revoked_at')
    t.string('user_agent', 255)
    t.string('ip_address', 45)
    standardColumns(knex, t)
    t.index(['admin_user_id'])
  })

  // ===== Plan =====
  await knex.schema.createTable('plans', (t) => {
    uuidPk(t)
    t.string('code', 50).notNullable()
    t.string('name', 100).notNullable()
    t.integer('max_users')
    t.integer('max_shipments_per_month')
    t.jsonb('features').notNullable().defaultTo('{}')
    t.decimal('price_monthly', 14, 2).notNullable().defaultTo(0)
    t.boolean('is_active').notNullable().defaultTo(true)
    standardColumns(knex, t)
  })
  await knex.raw('CREATE UNIQUE INDEX uq_plans_code ON plans (code) WHERE is_deleted = false')

  // ===== Cluster DB =====
  await knex.schema.createTable('db_clusters', (t) => {
    uuidPk(t)
    t.string('name', 100).notNullable()
    t.string('host', 255).notNullable()
    t.integer('port').notNullable().defaultTo(5432)
    t.string('pooler_host', 255)
    t.integer('pooler_port')
    t.string('admin_secret_ref', 255).notNullable() // prefix env role provisioner, mis. CLUSTER_PG_PROD_01
    t.integer('max_tenants').notNullable().defaultTo(100)
    t.integer('tenant_count').notNullable().defaultTo(0)
    t.string('status', 20).notNullable().defaultTo('active') // active | full | maintenance | disabled
    standardColumns(knex, t)
  })
  await knex.raw('CREATE UNIQUE INDEX uq_db_clusters_name ON db_clusters (name) WHERE is_deleted = false')

  // ===== Client =====
  await knex.schema.createTable('clients', (t) => {
    uuidPk(t)
    t.string('client_code', 30).notNullable()
    t.string('name', 150).notNullable()
    t.string('legal_name', 200)
    t.string('email', 150)
    t.string('phone', 30)
    t.text('address')
    t.string('npwp', 30)
    // provisioning | provisioning_failed | active | suspended | deprovisioning | deleted
    t.string('status', 30).notNullable().defaultTo('provisioning')
    t.text('status_reason')
    t.jsonb('settings').notNullable().defaultTo('{}')
    standardColumns(knex, t)
    t.index(['status'])
  })
  await knex.raw('CREATE UNIQUE INDEX uq_clients_code ON clients (client_code) WHERE is_deleted = false')

  await knex.schema.createTable('subscriptions', (t) => {
    uuidPk(t)
    t.uuid('client_id').notNullable().references('id').inTable('clients')
    t.uuid('plan_id').notNullable().references('id').inTable('plans')
    t.string('status', 20).notNullable().defaultTo('trial') // trial | active | past_due | expired | cancelled
    t.date('start_date').notNullable()
    t.date('end_date')
    t.date('trial_end_date')
    t.boolean('auto_renew').notNullable().defaultTo(true)
    t.text('notes')
    standardColumns(knex, t)
    t.index(['client_id'])
  })
  await knex.raw(`
    CREATE UNIQUE INDEX uq_subscriptions_current ON subscriptions (client_id)
    WHERE status IN ('trial','active','past_due') AND is_deleted = false
  `)

  // ===== Config DB Tenant =====
  await knex.schema.createTable('tenant_db_configs', (t) => {
    uuidPk(t)
    t.uuid('client_id').notNullable().references('id').inTable('clients')
    t.uuid('cluster_id').notNullable().references('id').inTable('db_clusters')
    t.string('db_name', 63).notNullable()
    t.string('db_owner_username', 63).notNullable() // lg_x_owner (DDL, migrasi)
    t.text('db_owner_password_enc').notNullable()
    t.string('db_app_username', 63).notNullable() // lg_x_app (DML, request user)
    t.text('db_app_password_enc').notNullable()
    t.integer('encryption_key_version').notNullable().defaultTo(1)
    t.string('system_user_username', 100).notNullable().defaultTo('msi.support')
    t.text('system_user_password_enc').notNullable()
    t.string('schema_version', 100)
    t.integer('pool_max').notNullable().defaultTo(5)
    tz(t, 'password_rotated_at')
    tz(t, 'provisioned_at')
    tz(t, 'dropped_at')
    standardColumns(knex, t)
  })
  await knex.raw('CREATE UNIQUE INDEX uq_tenant_db_configs_client ON tenant_db_configs (client_id) WHERE is_deleted = false')
  await knex.raw('CREATE UNIQUE INDEX uq_tenant_db_configs_db_name ON tenant_db_configs (db_name) WHERE is_deleted = false')
  await knex.raw('CREATE UNIQUE INDEX uq_tenant_db_configs_owner ON tenant_db_configs (db_owner_username) WHERE is_deleted = false')
  await knex.raw('CREATE UNIQUE INDEX uq_tenant_db_configs_app ON tenant_db_configs (db_app_username) WHERE is_deleted = false')

  // ===== Rollout migrasi =====
  await knex.schema.createTable('migration_rollouts', (t) => {
    uuidPk(t)
    t.string('target_version', 100).notNullable()
    t.integer('total_tenants').notNullable().defaultTo(0)
    t.integer('success_count').notNullable().defaultTo(0)
    t.integer('failed_count').notNullable().defaultTo(0)
    t.string('status', 30).notNullable().defaultTo('running') // running | completed | completed_with_errors
    t.uuid('requested_by')
    tz(t, 'finished_at')
    standardColumns(knex, t)
  })

  // ===== Provisioning =====
  await knex.schema.createTable('provisioning_jobs', (t) => {
    uuidPk(t)
    t.uuid('client_id').notNullable().references('id').inTable('clients')
    // provision | migrate | cleanup | deprovision | rotate_password | reset_system_user
    t.string('type', 30).notNullable()
    // queued | running | success | failed | rolling_back | rolled_back | rollback_failed
    t.string('status', 20).notNullable().defaultTo('queued')
    t.string('mode', 20).notNullable().defaultTo('full') // full | resume
    t.uuid('parent_job_id').references('id').inTable('provisioning_jobs')
    t.uuid('rollout_id').references('id').inTable('migration_rollouts')
    t.jsonb('params').notNullable().defaultTo('{}')
    t.integer('attempt').notNullable().defaultTo(0)
    t.string('failed_step', 50)
    t.text('error_message')
    t.jsonb('error_detail')
    t.uuid('requested_by')
    t.string('worker_id', 100)
    tz(t, 'queued_at').notNullable().defaultTo(knex.fn.now())
    tz(t, 'started_at')
    tz(t, 'finished_at')
    standardColumns(knex, t)
    t.index(['client_id'])
    t.index(['status'])
    t.index(['rollout_id'])
  })
  // hanya satu job aktif per client
  await knex.raw(`
    CREATE UNIQUE INDEX uq_prov_jobs_active ON provisioning_jobs (client_id)
    WHERE status IN ('queued','running','rolling_back') AND is_deleted = false
  `)

  await knex.schema.createTable('provisioning_steps', (t) => {
    uuidPk(t)
    t.uuid('job_id').notNullable().references('id').inTable('provisioning_jobs')
      .onDelete('CASCADE')
    t.integer('step_order').notNullable()
    t.string('step_name', 50).notNullable()
    t.string('executor', 20).notNullable() // saas-worker | logistics-api
    // pending | running | success | failed | skipped | compensated | compensate_failed
    t.string('status', 20).notNullable().defaultTo('pending')
    t.integer('attempt').notNullable().defaultTo(0)
    t.text('message')
    t.text('error_message')
    t.jsonb('error_detail')
    t.integer('http_status')
    t.jsonb('response_body')
    tz(t, 'started_at')
    tz(t, 'finished_at')
    standardColumns(knex, t)
    t.unique(['job_id', 'step_name'])
  })

  // ===== Outbox =====
  await knex.schema.createTable('outbox_events', (t) => {
    t.bigIncrements('id').primary()
    t.string('event_type', 100).notNullable()
    t.string('routing_key', 100).notNullable()
    t.jsonb('payload').notNullable()
    t.integer('attempts').notNullable().defaultTo(0)
    t.text('last_error')
    tz(t, 'published_at')
    standardColumns(knex, t)
  })
  await knex.raw('CREATE INDEX idx_outbox_unpublished ON outbox_events (id) WHERE published_at IS NULL AND is_deleted = false')

  // ===== Audit =====
  await knex.schema.createTable('audit_logs', (t) => {
    t.bigIncrements('id').primary()
    t.string('actor_type', 20).notNullable() // admin | system | worker | logistics-api
    t.string('actor_id', 100)
    t.string('action', 100).notNullable()
    t.string('target_type', 50)
    t.string('target_id', 100)
    t.jsonb('before_data')
    t.jsonb('after_data')
    t.string('ip_address', 45)
    t.string('request_id', 100)
    standardColumns(knex, t)
    t.index(['target_type', 'target_id'])
  })

  // eslint-disable-next-line no-restricted-syntax
  for (const table of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(updatedAtTrigger(table))
  }
}

exports.down = async (knex) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const table of [...TABLES].reverse()) {
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.dropTableIfExists(table)
  }
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()')
}

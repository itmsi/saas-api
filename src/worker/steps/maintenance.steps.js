/**
 * Step untuk job cleanup, deprovision, migrate (rollout), rotate_password, reset_system_user.
 */
const fs = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')
const config = require('../../config')
const db = require('../../database')
const { stamp } = require('../../database')
const cache = require('../../lib/cache')
const { encrypt, decrypt, randomPassword } = require('../../lib/crypto')
const { withAdmin, ident, literal } = require('../../lib/pg-admin')
const { permanent } = require('../../lib/errors')
const logisticsApi = require('../../clients/logistics-api.client')
const { dropDatabase, dropRoles, terminateConnections } = require('./db-ops')
const migrateStep = require('./run-migrations.step')

const invalidate = (ctx, reason) => cache.invalidateTenant({ client_id: ctx.client.id, client_code: ctx.client.client_code }, reason)

/** Hitung ulang status rollout setelah satu tenant selesai */
const bumpRollout = async (trx, rolloutId, field) => {
  if (!rolloutId) return
  await trx('migration_rollouts').where({ id: rolloutId }).increment(field, 1)
  await trx('migration_rollouts')
    .where({ id: rolloutId, status: 'running' })
    .whereRaw('success_count + failed_count >= total_tenants')
    .update({
      status: trx.raw("CASE WHEN failed_count > 0 THEN 'completed_with_errors' ELSE 'completed' END"),
      finished_at: trx.fn.now(),
    })
}

const steps = {
  // ===== provision (cleanup_first) / cleanup =====
  cleanup_existing: {
    executor: 'saas-worker',
    run: async (ctx) => {
      const a = await dropDatabase(ctx)
      const b = await dropRoles(ctx)
      return { message: `${a.message}; ${b.message}` }
    },
  },
  drop_database: { executor: 'saas-worker', run: dropDatabase },
  drop_roles: { executor: 'saas-worker', run: dropRoles },
  finalize_cleanup: {
    executor: 'saas-worker',
    run: async (ctx) => {
      await db('clients').where({ id: ctx.client.id }).update(stamp.update({
        status: 'provisioning_failed', status_reason: 'Dibersihkan; siap di-provision ulang',
      }))
      await invalidate(ctx, 'cleanup')
      return { message: 'Database & role dibersihkan' }
    },
  },

  // ===== deprovision =====
  backup: {
    executor: 'saas-worker',
    run: async (ctx) => {
      const t = ctx.tenant
      await fs.mkdir(config.worker.backupDir, { recursive: true })
      const stampStr = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.join(config.worker.backupDir, `${t.db_name}_${stampStr}.dump`)
      await new Promise((resolve, reject) => {
        const child = spawn(config.worker.pgDumpPath, [
          '-Fc', '-h', ctx.cluster.host, '-p', String(ctx.cluster.port), '-U', t.db_owner_username, '-d', t.db_name, '-f', file,
        ], { env: { ...process.env, PGPASSWORD: ctx.secrets.ownerPassword() } })
        let stderr = ''
        child.stderr.on('data', (d) => { stderr += d })
        child.on('error', (err) => reject(permanent(`pg_dump tidak bisa dijalankan: ${err.message}`, { code: 'BACKUP_FAILED' })))
        child.on('close', (code) => (code === 0
          ? resolve()
          : reject(permanent(`pg_dump gagal (exit ${code})`, { code: 'BACKUP_FAILED', detail: { stderr: stderr.slice(0, 2000) } }))))
      }).catch(async (err) => {
        await fs.rm(file, { force: true }) // jangan tinggalkan file dump setengah jadi
        throw err
      })
      const { size } = await fs.stat(file)
      return { message: `Backup ${file} (${size} byte)`, response_body: { file, size } }
    },
  },
  revoke_connect: {
    executor: 'saas-worker',
    run: (ctx) => withAdmin(ctx.cluster, async (pg) => {
      const t = ctx.tenant
      const exists = (await pg.query('SELECT 1 FROM pg_database WHERE datname = $1', [t.db_name])).rowCount > 0
      if (!exists) return { message: 'Database tidak ada (lewati)' }
      await pg.query(`REVOKE CONNECT ON DATABASE ${ident(t.db_name)} FROM PUBLIC`)
      const appExists = (await pg.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [t.db_app_username])).rowCount > 0
      if (appExists) await pg.query(`REVOKE CONNECT ON DATABASE ${ident(t.db_name)} FROM ${ident(t.db_app_username)}`)
      const { rowCount } = await terminateConnections(pg, t.db_name)
      await invalidate(ctx, 'deprovisioning')
      return { message: `CONNECT dicabut, ${rowCount} koneksi diputus` }
    }),
  },
  finalize_deprovision: {
    executor: 'saas-worker',
    run: async (ctx) => {
      const actor = ctx.job.requested_by || null
      await db.transaction(async (trx) => {
        await trx('clients').where({ id: ctx.client.id }).update({
          ...stamp.remove(actor), status: 'deleted',
        })
        await trx('tenant_db_configs').where({ id: ctx.tenant.id }).update({
          ...stamp.remove(actor), dropped_at: trx.fn.now(),
        })
        await trx('subscriptions').where({ client_id: ctx.client.id, is_deleted: false })
          .whereIn('status', ['trial', 'active', 'past_due'])
          .update(stamp.update({ status: 'cancelled', end_date: trx.fn.now() }, actor))
        const cluster = await trx('db_clusters').where({ id: ctx.cluster.id }).forUpdate().first()
        const count = Math.max(0, cluster.tenant_count - 1)
        await trx('db_clusters').where({ id: cluster.id }).update(stamp.update({
          tenant_count: count,
          status: cluster.status === 'full' && count < cluster.max_tenants ? 'active' : cluster.status,
        }))
      })
      await invalidate(ctx, 'deleted')
      return { message: `Client ${ctx.client.client_code} dihapus` }
    },
  },

  // ===== migrate (rollout) =====
  finalize_migrate: {
    executor: 'saas-worker',
    run: async (ctx) => {
      await db.transaction(async (trx) => {
        if (ctx.state.schemaVersion) {
          await trx('tenant_db_configs').where({ id: ctx.tenant.id }).update(stamp.update({ schema_version: ctx.state.schemaVersion }))
        }
        await bumpRollout(trx, ctx.job.rollout_id, 'success_count')
      })
      await invalidate(ctx, 'schema_version_changed')
      return { message: `schema_version ${ctx.state.schemaVersion || '(tidak berubah)'}` }
    },
  },

  // ===== rotate_password =====
  rotate_password: {
    executor: 'saas-worker',
    run: async (ctx) => {
      const t = ctx.tenant
      const oldOwner = decrypt(t.db_owner_password_enc)
      const oldApp = decrypt(t.db_app_password_enc)
      const newOwner = randomPassword()
      const newApp = randomPassword()

      const alter = (owner, app) => withAdmin(ctx.cluster, async (pg) => {
        await pg.query(`ALTER ROLE ${ident(t.db_owner_username)} WITH PASSWORD ${literal(owner)}`)
        await pg.query(`ALTER ROLE ${ident(t.db_app_username)} WITH PASSWORD ${literal(app)}`)
      })

      await alter(newOwner, newApp)
      try {
        await db('tenant_db_configs').where({ id: t.id }).update(stamp.update({
          db_owner_password_enc: encrypt(newOwner),
          db_app_password_enc: encrypt(newApp),
          encryption_key_version: config.tenantDb.encKeyVersion,
          password_rotated_at: db.fn.now(),
        }, ctx.job.requested_by))
      } catch (err) {
        // Simpan gagal -> kembalikan password lama agar tenant tetap bisa konek
        await alter(oldOwner, oldApp).catch(() => {})
        throw err
      }
      return { message: `Password ${t.db_owner_username} & ${t.db_app_username} dirotasi` }
    },
  },
  finalize_rotate: {
    executor: 'saas-worker',
    run: async (ctx) => {
      await invalidate(ctx, 'password_rotated')
      return { message: 'Cache dihapus, logistics-api akan membuat pool baru' }
    },
  },

  // ===== reset_system_user =====
  reset_system_user: {
    executor: 'logistics-api',
    run: async (ctx) => {
      // Simpan password baru sekali (retry memakai password yang sama); password lama disimpan untuk restore
      if (!ctx.state.previousSystemUserEnc) {
        ctx.state.previousSystemUserEnc = ctx.tenant.system_user_password_enc
        await db('tenant_db_configs').where({ id: ctx.tenant.id }).update(stamp.update({
          system_user_password_enc: encrypt(randomPassword(18)),
        }, ctx.job.requested_by))
      }
      const res = await logisticsApi.resetSystemUser(ctx.client.id, ctx.httpOptions('reset_system_user'))
      return { message: 'Password ghost user di-reset', http_status: res.status, response_body: res.body }
    },
  },
}

module.exports = { steps, bumpRollout, migrateStep }

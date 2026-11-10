/**
 * Definisi tipe job: kebijakan rollback + hook saat gagal.
 * Urutan step ada di src/lib/job-plans.js, implementasinya di src/worker/steps.
 */
const config = require('../../config')
const db = require('../../database')
const { stamp } = require('../../database')
const { bumpRollout } = require('../steps/maintenance.steps')

const setClientReason = (ctx, data) => db('clients').where({ id: ctx.client.id }).update(stamp.update(data))

module.exports = {
  provision: {
    // Rollback all: drop database -> drop roles (bisa dimatikan untuk debug)
    rollback: () => config.worker.rollbackOnFailure,
    onFailure: (ctx, err) => setClientReason(ctx, {
      status: 'provisioning_failed', status_reason: `${ctx.failedStep}: ${err.message}`.slice(0, 2000),
    }),
  },
  migrate: {
    // Tidak drop DB: migrasi yang gagal otomatis batal karena transaksi di logistics-api
    rollback: () => false,
    onFailure: (ctx) => db.transaction((trx) => bumpRollout(trx, ctx.job.rollout_id, 'failed_count')),
  },
  cleanup: {
    rollback: () => false,
    onFailure: (ctx, err) => setClientReason(ctx, { status_reason: `cleanup gagal: ${err.message}`.slice(0, 2000) }),
  },
  deprovision: {
    rollback: () => false,
    onFailure: (ctx, err) => setClientReason(ctx, { status_reason: `deprovision gagal di ${ctx.failedStep}: ${err.message}`.slice(0, 2000) }),
  },
  rotate_password: {
    rollback: () => false,
    onFailure: async () => {},
  },
  reset_system_user: {
    rollback: () => false,
    // logistics-api gagal -> kembalikan password ghost user lama di saas_core
    onFailure: async (ctx) => {
      if (ctx.state.previousSystemUserEnc) {
        await db('tenant_db_configs').where({ id: ctx.tenant.id }).update(stamp.update({
          system_user_password_enc: ctx.state.previousSystemUserEnc,
        }))
      }
    },
  },
}

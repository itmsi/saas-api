/**
 * Daftar step per tipe job. Dipakai:
 *  - saas-api   : membuat baris provisioning_steps (status pending) saat job dibuat
 *  - saas-worker: mencocokkan nama step dengan implementasinya (src/worker/steps)
 */
const W = 'saas-worker'
const L = 'logistics-api'

const PROVISION_STEPS = [
  ['create_roles', W],
  ['create_database', W],
  ['grant_privileges', W],
  ['run_migrations', L],
  ['run_seeders', L],
  ['verify', L],
  ['finalize', W],
]

const PLANS = {
  provision: (params = {}) => (params.cleanup_first
    ? [['cleanup_existing', W], ...PROVISION_STEPS]
    : PROVISION_STEPS),
  migrate: () => [['run_migrations', L], ['finalize_migrate', W]],
  cleanup: () => [['drop_database', W], ['drop_roles', W], ['finalize_cleanup', W]],
  deprovision: (params = {}) => [
    ...(params.backup ? [['backup', W]] : []),
    ['revoke_connect', W],
    ['drop_database', W],
    ['drop_roles', W],
    ['finalize_deprovision', W],
  ],
  rotate_password: () => [['rotate_password', W], ['finalize_rotate', W]],
  reset_system_user: () => [['reset_system_user', L]],
}

const JOB_TYPES = Object.keys(PLANS)

/** @returns {{ step_order: number, step_name: string, executor: string }[]} */
const stepsFor = (type, params) => {
  const plan = PLANS[type]
  if (!plan) throw new Error(`Tipe job tidak dikenal: ${type}`)
  return plan(params).map(([name, executor], i) => ({ step_order: i + 1, step_name: name, executor }))
}

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'rolling_back']
const FAILED_JOB_STATUSES = ['failed', 'rolled_back', 'rollback_failed']

module.exports = {
  stepsFor, JOB_TYPES, ACTIVE_JOB_STATUSES, FAILED_JOB_STATUSES,
}

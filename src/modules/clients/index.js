const router = require('express').Router()
const { authenticate, canWrite, superadminOnly } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')
const subscriptions = require('../subscriptions')

router.use(authenticate)

/**
 * @route   POST /api/v1/clients/list
 * @desc    List client (filter status, search, cluster, plan, pagination)
 * @access  Admin
 */
router.post('/list', validate({ body: schema.list }), controller.list)

/**
 * @route   POST /api/v1/clients
 * @desc    Buat client + subscription + config DB + job provisioning (satu transaksi) -> 202 + job_id
 * @access  superadmin, operator
 */
router.post('/', canWrite, validate({ body: schema.create }), controller.create)

/**
 * @route   GET /api/v1/clients/:id
 * @desc    Detail client + subscription + status DB (tanpa password)
 * @access  Admin
 */
router.get('/:id', validate({ params: schema.idParam }), controller.detail)

/**
 * @route   PATCH /api/v1/clients/:id
 * @desc    Ubah profil client
 * @access  superadmin, operator
 */
router.patch('/:id', canWrite, validate({ params: schema.idParam, body: schema.update }), controller.update)

/**
 * @route   PATCH /api/v1/clients/:id/status
 * @desc    Suspend / activate (hapus cache + publish tenant-invalidate)
 * @access  superadmin, operator
 */
router.patch('/:id/status', canWrite, validate({ params: schema.idParam, body: schema.updateStatus }), controller.updateStatus)

/**
 * @route   POST /api/v1/clients/:id/deprovision
 * @desc    Offboarding: backup -> drop DB & role -> soft delete client
 * @access  superadmin, operator
 */
router.post('/:id/deprovision', canWrite, validate({ params: schema.idParam, body: schema.deprovision }), controller.deprovision)

/**
 * @route   GET /api/v1/clients/:id/db-config
 * @desc    Config DB tenant (tanpa password)
 * @access  Admin
 */
router.get('/:id/db-config', validate({ params: schema.idParam }), controller.dbConfig)

/**
 * @route   POST /api/v1/clients/:id/rotate-db-password
 * @desc    Job rotasi password role owner & app
 * @access  superadmin, operator
 */
router.post('/:id/rotate-db-password', canWrite, validate({ params: schema.idParam }), controller.rotateDbPassword)

/**
 * @route   POST /api/v1/clients/:id/reveal-system-user
 * @desc    Lihat password ghost user (tercatat di audit)
 * @access  superadmin
 */
router.post('/:id/reveal-system-user', superadminOnly, validate({ params: schema.idParam }), controller.revealSystemUser)

/**
 * @route   POST /api/v1/clients/:id/reset-system-user
 * @desc    Job reset password ghost user di logistics-api
 * @access  superadmin, operator
 */
router.post('/:id/reset-system-user', canWrite, validate({ params: schema.idParam }), controller.resetSystemUser)

/**
 * @route   POST /api/v1/clients/:id/jobs
 * @desc    Histori job provisioning client
 * @access  Admin
 */
router.post('/:id/jobs', validate({ params: schema.idParam, body: schema.jobs }), controller.jobs)

/**
 * @route   POST /api/v1/clients/:id/audit-logs
 * @desc    Histori aktivitas admin terhadap client
 * @access  Admin
 */
router.post('/:id/audit-logs', validate({ params: schema.idParam, body: schema.auditLogs }), controller.auditLogs)

// /api/v1/clients/:id/subscriptions -> modul subscriptions
router.use('/:id/subscriptions', subscriptions.clientRouter)

module.exports = router

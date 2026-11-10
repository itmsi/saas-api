const router = require('express').Router()
const { authenticate, canWrite } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

router.use(authenticate)

/**
 * @route   GET /api/v1/migrations/status
 * @desc    Versi migrasi terbaru di logistics-api + jumlah tenant per schema_version
 * @access  Admin
 */
router.get('/status', controller.status)

/**
 * @route   POST /api/v1/migrations/rollout
 * @desc    Rollout migrasi ke semua / sebagian tenant (1 job migrate per tenant)
 * @access  superadmin, operator
 */
router.post('/rollout', canWrite, validate({ body: schema.rollout }), controller.rollout)

/**
 * @route   GET /api/v1/migrations/rollouts
 * @desc    List rollout
 * @access  Admin
 */
router.get('/rollouts', validate({ query: schema.list }), controller.listRollouts)

/**
 * @route   GET /api/v1/migrations/rollouts/:id
 * @desc    Progress rollout + tenant yang gagal
 * @access  Admin
 */
router.get('/rollouts/:id', validate({ params: schema.idParam }), controller.rolloutDetail)

/**
 * @route   POST /api/v1/migrations/rollouts/:id/retry-failed
 * @desc    Ulangi tenant yang gagal
 * @access  superadmin, operator
 */
router.post('/rollouts/:id/retry-failed', canWrite, validate({ params: schema.idParam }), controller.retryFailed)

module.exports = router

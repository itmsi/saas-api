const router = require('express').Router()
const { authenticate, canWrite } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

router.use(authenticate)

/**
 * @route   POST /api/v1/provisioning-jobs/list
 * @desc    List job (filter status, type, client, rollout)
 * @access  Admin
 */
router.post('/list', validate({ body: schema.list }), controller.list)

/**
 * @route   GET /api/v1/provisioning-jobs/:id
 * @desc    Detail job + semua step + error + respons logistics-api
 * @access  Admin
 */
router.get('/:id', validate({ params: schema.idParam }), controller.detail)

/**
 * @route   POST /api/v1/provisioning-jobs/:id/retry
 * @desc    Retry job gagal (resume jika DB tidak di-rollback)
 * @access  superadmin, operator
 */
router.post('/:id/retry', canWrite, validate({ params: schema.idParam }), controller.retry)

/**
 * @route   POST /api/v1/provisioning-jobs/:id/cleanup-and-rerun
 * @desc    Paksa drop DB & role lalu provisioning ulang dari awal
 * @access  superadmin, operator
 */
router.post('/:id/cleanup-and-rerun', canWrite, validate({ params: schema.idParam }), controller.cleanupAndRerun)

/**
 * @route   POST /api/v1/provisioning-jobs/:id/cleanup
 * @desc    Cleanup saja (drop DB & role)
 * @access  superadmin, operator
 */
router.post('/:id/cleanup', canWrite, validate({ params: schema.idParam }), controller.cleanup)

module.exports = router

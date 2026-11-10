const router = require('express').Router()
const { authenticate, canWrite } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

router.use(authenticate)

/**
 * @route   GET /api/v1/plans
 * @desc    List plan
 * @access  Admin
 */
router.get('/', validate({ query: schema.list }), controller.list)

/**
 * @route   GET /api/v1/plans/:id
 * @desc    Detail plan
 * @access  Admin
 */
router.get('/:id', validate({ params: schema.idParam }), controller.detail)

/**
 * @route   POST /api/v1/plans
 * @desc    Buat plan
 * @access  superadmin, operator
 */
router.post('/', canWrite, validate({ body: schema.create }), controller.create)

/**
 * @route   PATCH /api/v1/plans/:id
 * @desc    Ubah plan / feature flags (invalidasi cache semua tenant di plan itu)
 * @access  superadmin, operator
 */
router.patch('/:id', canWrite, validate({ params: schema.idParam, body: schema.update }), controller.update)

/**
 * @route   DELETE /api/v1/plans/:id
 * @desc    Hapus plan (soft delete, ditolak jika masih dipakai)
 * @access  superadmin, operator
 */
router.delete('/:id', canWrite, validate({ params: schema.idParam }), controller.remove)

module.exports = router

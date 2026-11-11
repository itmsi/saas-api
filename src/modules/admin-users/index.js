const router = require('express').Router()
const { authenticate, superadminOnly } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

// Semua endpoint admin users khusus superadmin
router.use(authenticate, superadminOnly)

/**
 * @route   POST /api/v1/admin-users/list
 * @desc    List admin MSI (search, role, is_active, pagination)
 * @access  superadmin
 */
router.post('/list', validate({ body: schema.list }), controller.list)

/**
 * @route   POST /api/v1/admin-users
 * @desc    Tambah admin
 * @access  superadmin
 */
router.post('/', validate({ body: schema.create }), controller.create)

/**
 * @route   GET /api/v1/admin-users/:id
 * @desc    Detail admin
 * @access  superadmin
 */
router.get('/:id', validate({ params: schema.idParam }), controller.detail)

/**
 * @route   PATCH /api/v1/admin-users/:id
 * @desc    Ubah data / role / nonaktifkan (nonaktif -> semua sesi dicabut)
 * @access  superadmin
 */
router.patch('/:id', validate({ params: schema.idParam, body: schema.update }), controller.update)

/**
 * @route   POST /api/v1/admin-users/:id/reset-password
 * @desc    Reset password (semua sesi dicabut)
 * @access  superadmin
 */
router.post('/:id/reset-password', validate({ params: schema.idParam, body: schema.resetPassword }), controller.resetPassword)

/**
 * @route   DELETE /api/v1/admin-users/:id
 * @desc    Hapus admin (soft delete)
 * @access  superadmin
 */
router.delete('/:id', validate({ params: schema.idParam }), controller.remove)

module.exports = router

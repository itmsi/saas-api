const router = require('express').Router()
const { authenticate, superadminOnly } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

router.use(authenticate)

/**
 * @route   POST /api/v1/clusters/list
 * @desc    List cluster + kapasitas
 * @access  Admin
 */
router.post('/list', validate({ body: schema.list }), controller.list)

/**
 * @route   GET /api/v1/clusters/:id
 * @desc    Detail cluster
 * @access  Admin
 */
router.get('/:id', validate({ params: schema.idParam }), controller.detail)

/**
 * @route   POST /api/v1/clusters
 * @desc    Daftarkan cluster
 * @access  superadmin
 */
router.post('/', superadminOnly, validate({ body: schema.create }), controller.create)

/**
 * @route   PATCH /api/v1/clusters/:id
 * @desc    Ubah host / kapasitas / status
 * @access  superadmin
 */
router.patch('/:id', superadminOnly, validate({ params: schema.idParam, body: schema.update }), controller.update)

/**
 * @route   DELETE /api/v1/clusters/:id
 * @desc    Hapus cluster (soft delete, hanya jika kosong)
 * @access  superadmin
 */
router.delete('/:id', superadminOnly, validate({ params: schema.idParam }), controller.remove)

/**
 * @route   POST /api/v1/clusters/:id/test-connection
 * @desc    Tes koneksi role provisioner (dijalankan oleh saas-worker)
 * @access  superadmin
 */
router.post('/:id/test-connection', superadminOnly, validate({ params: schema.idParam }), controller.testConnection)

module.exports = router

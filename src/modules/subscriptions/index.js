const express = require('express')
const { authenticate, canWrite } = require('../../middlewares/auth')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

/*
 * Dipasang di DUA tempat:
 *   clientRouter -> /api/v1/clients/:id/subscriptions  (dari modul clients, auth sudah dicek di sana)
 *   router       -> /api/v1/subscriptions
 */

// ---------- /api/v1/clients/:id/subscriptions ----------
const clientRouter = express.Router({ mergeParams: true })

/**
 * @route   GET /api/v1/clients/:id/subscriptions
 * @desc    Histori subscription client
 * @access  Admin
 */
clientRouter.get('/', validate({ params: schema.idParam }), controller.listByClient)

/**
 * @route   POST /api/v1/clients/:id/subscriptions
 * @desc    Buat / ganti subscription (yang sedang berjalan di-cancel)
 * @access  superadmin, operator
 */
clientRouter.post('/', canWrite, validate({ params: schema.idParam, body: schema.create }), controller.create)

// ---------- /api/v1/subscriptions ----------
const router = express.Router()
router.use(authenticate)

/**
 * @route   PATCH /api/v1/subscriptions/:id
 * @desc    Ubah status / tanggal subscription
 * @access  superadmin, operator
 */
router.patch('/:id', canWrite, validate({ params: schema.idParam, body: schema.update }), controller.update)

module.exports = router
module.exports.clientRouter = clientRouter

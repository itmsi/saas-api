/**
 * Endpoint internal untuk logistics-api (tidak diekspos di Kong publik).
 * Auth: header X-Internal-Key (INTERNAL_API_KEY / INTERNAL_PROVISIONING_KEY).
 */
const router = require('express').Router()
const { internalKey } = require('../../middlewares/internal-key')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

router.use(internalKey)

// by-id harus didaftarkan sebelum :client_code

/**
 * @route   GET /internal/tenants/by-id/:client_id/resolve?scope=default|provisioning
 * @desc    Resolve tenant by id. scope=provisioning -> role owner + system user
 * @access  X-Internal-Key (scope=provisioning wajib INTERNAL_PROVISIONING_KEY)
 */
router.get('/tenants/by-id/:client_id/resolve', validate({ params: schema.byId, query: schema.resolveQuery }), controller.resolveById)

/**
 * @route   GET /internal/tenants/:client_code/resolve
 * @desc    Resolve tenant untuk request user normal (hanya active, role app)
 * @access  X-Internal-Key
 */
router.get('/tenants/:client_code/resolve', validate({ params: schema.byCode, query: schema.resolveQuery }), controller.resolveByCode)

module.exports = router

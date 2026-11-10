const express = require('express')
const { apiLimiter } = require('../middlewares/rate-limit')

const router = express.Router()

router.use(apiLimiter)

/*
 * Endpoint admin MSI di bawah /api/v1 (JWT admin, kecuali /auth/login & /auth/refresh).
 * Kontrak lengkap: /documentation (src/static/index.js).
 */
router.use('/auth', require('../modules/auth'))
router.use('/admin-users', require('../modules/admin-users'))
router.use('/plans', require('../modules/plans'))
router.use('/clusters', require('../modules/clusters'))
router.use('/clients', require('../modules/clients'))
router.use('/subscriptions', require('../modules/subscriptions'))
router.use('/provisioning-jobs', require('../modules/provisioning'))
router.use('/migrations', require('../modules/migrations'))

module.exports = router

const router = require('express').Router()
const { authenticate } = require('../../middlewares/auth')
const { authLimiter } = require('../../middlewares/rate-limit')
const { validate } = require('../../middlewares/validate')
const schema = require('./validation')
const controller = require('./controller')

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login admin MSI -> access token + refresh token
 * @access  Public (rate limit)
 */
router.post('/login', authLimiter, validate({ body: schema.login }), controller.login)

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Tukar refresh token (rotasi: token lama dicabut)
 * @access  Public (rate limit)
 */
router.post('/refresh', authLimiter, validate({ body: schema.refresh }), controller.refresh)

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Cabut refresh token
 * @access  Admin
 */
router.post('/logout', authenticate, validate({ body: schema.refresh }), controller.logout)

/**
 * @route   GET /api/v1/auth/me
 * @desc    Profil admin yang login
 * @access  Admin
 */
router.get('/me', authenticate, controller.me)

module.exports = router

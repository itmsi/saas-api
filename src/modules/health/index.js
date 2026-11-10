const router = require('express').Router()
const controller = require('./controller')

/**
 * @route   GET /health
 * @desc    Liveness (proses hidup)
 * @access  Public
 */
router.get('/health', controller.liveness)

/**
 * @route   GET /health/ready
 * @desc    Readiness: Postgres, RabbitMQ, Redis (503 jika ada yang down)
 * @access  Public
 */
router.get('/health/ready', controller.readiness)

module.exports = router

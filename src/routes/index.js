const express = require('express')
const swaggerUi = require('swagger-ui-express')
const config = require('../config')
const { ok } = require('../utils/response')
const v1 = require('./v1')

const router = express.Router()

router.get('/', (req, res) => ok(res, {
  name: config.app.name,
  env: config.app.env,
  uptime_seconds: Math.round(process.uptime()),
  server_time: new Date().toISOString(),
  documentation: config.app.swaggerEnabled ? '/documentation' : null,
}))

router.use(require('../modules/health'))

if (config.app.swaggerEnabled) {
  const { index } = require('../static')
  router.get('/documentation.json', (req, res) => res.json(index))
  router.use('/documentation', swaggerUi.serve, swaggerUi.setup(index, {
    customSiteTitle: 'logistics-saas-api',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
  }))
}

// Untuk logistics-api (X-Internal-Key). Jangan diekspos di Kong publik.
router.use('/internal', require('../modules/internal'))

router.use('/api/v1', v1)

module.exports = router

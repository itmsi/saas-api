/**
 * Swagger API Path Definitions for Health Module
 * Ada di root (bukan /api/v1), jadi server di-override per path.
 */
const { ref } = require('../helpers')

const rootServer = [{ url: '/', description: 'Root' }]

const healthPaths = {
  '/health': {
    servers: rootServer,
    get: {
      tags: ['Health'],
      summary: 'Liveness',
      description: 'Proses API hidup. Dipakai healthcheck Docker.',
      security: [],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: ref('HealthResponse') } } },
      },
    },
  },
  '/health/ready': {
    servers: rootServer,
    get: {
      tags: ['Health'],
      summary: 'Readiness',
      description: 'Cek koneksi Postgres (saas_core), RabbitMQ, dan Redis. 503 jika salah satu down.',
      security: [],
      responses: {
        200: { description: 'Semua dependency up', content: { 'application/json': { schema: ref('ReadinessResponse') } } },
        503: {
          description: 'Ada dependency yang down',
          content: {
            'application/json': {
              schema: ref('ReadinessResponse'),
              example: {
                success: false,
                data: {
                  status: 'degraded', postgres: 'up', rabbitmq: 'down', redis: 'up', uptime_seconds: 12,
                },
              },
            },
          },
        },
      },
    },
  },
}

module.exports = healthPaths

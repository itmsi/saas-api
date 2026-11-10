/**
 * Swagger Schema Definitions for Health Module
 */

const healthSchemas = {
  HealthResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          uptime_seconds: { type: 'integer', example: 3600 },
        },
      },
    },
  },
  ReadinessResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'], example: 'ok' },
          postgres: { type: 'string', enum: ['up', 'down'], example: 'up' },
          rabbitmq: { type: 'string', enum: ['up', 'down'], example: 'up' },
          redis: { type: 'string', enum: ['up', 'down'], example: 'up' },
          uptime_seconds: { type: 'integer', example: 3600 },
        },
      },
    },
  },
}

module.exports = healthSchemas

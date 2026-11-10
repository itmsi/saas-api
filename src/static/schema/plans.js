/**
 * Swagger Schema Definitions for Plans Module
 */

const planFields = {
  name: { type: 'string', maxLength: 100, example: 'Pro' },
  max_users: {
    type: 'integer', nullable: true, description: 'null = tanpa batas', example: 50
  },
  max_shipments_per_month: {
    type: 'integer', nullable: true, description: 'null = tanpa batas', example: 10000
  },
  features: {
    type: 'object',
    additionalProperties: true,
    description: 'Feature flag, diteruskan ke logistics-api lewat resolve tenant',
    example: {
      tracking: true, driver_app: true, reports: true, api_access: false
    },
  },
  price_monthly: { type: 'number', format: 'double', example: 1500000 },
  is_active: { type: 'boolean', example: true },
}

const planSchemas = {
  Plan: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '0d9c7a6e-5b4f-4e3d-9c2b-1a0f9e8d7c6b' },
          code: { type: 'string', example: 'pro' },
          ...planFields,
          price_monthly: { type: 'string', description: 'Numeric dari Postgres dikirim sebagai string', example: '1500000.00' },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  PlanCreateRequest: {
    type: 'object',
    required: ['code', 'name'],
    properties: {
      code: { type: 'string', pattern: '^[a-z0-9_-]{2,50}$', example: 'pro' },
      ...planFields,
    },
  },
  PlanUpdateRequest: {
    type: 'object',
    minProperties: 1,
    properties: planFields,
  },
}

module.exports = planSchemas

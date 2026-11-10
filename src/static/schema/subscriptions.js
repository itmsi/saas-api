/**
 * Swagger Schema Definitions for Subscriptions Module
 */

const status = { type: 'string', enum: ['trial', 'active', 'past_due', 'expired', 'cancelled'], example: 'active' }

const subscriptionSchemas = {
  Subscription: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '1222a6ec-50ed-4895-9553-895440c4f95f' },
          client_id: { type: 'string', format: 'uuid' },
          plan_id: { type: 'string', format: 'uuid' },
          plan_code: { type: 'string', example: 'enterprise' },
          plan_name: { type: 'string', example: 'Enterprise' },
          status,
          start_date: { type: 'string', format: 'date', example: '2026-12-01' },
          end_date: {
            type: 'string', format: 'date', nullable: true, example: '2027-11-30'
          },
          trial_end_date: { type: 'string', format: 'date', nullable: true },
          auto_renew: { type: 'boolean', example: true },
          notes: { type: 'string', nullable: true },
        },
      },
      { $ref: '#/components/schemas/AuditFields' },
    ],
  },
  SubscriptionCreateRequest: {
    type: 'object',
    required: ['plan_code'],
    properties: {
      plan_code: { type: 'string', example: 'enterprise' },
      status: { type: 'string', enum: ['trial', 'active'], default: 'active' },
      start_date: {
        type: 'string', format: 'date', description: 'Default hari ini', example: '2026-12-01'
      },
      end_date: {
        type: 'string', format: 'date', nullable: true, example: '2027-11-30'
      },
      trial_end_date: { type: 'string', format: 'date', nullable: true },
      auto_renew: { type: 'boolean', default: true },
      notes: { type: 'string', nullable: true, example: 'Upgrade dari Pro' },
    },
  },
  SubscriptionUpdateRequest: {
    type: 'object',
    minProperties: 1,
    properties: {
      status,
      start_date: { type: 'string', format: 'date' },
      end_date: { type: 'string', format: 'date', nullable: true },
      trial_end_date: { type: 'string', format: 'date', nullable: true },
      auto_renew: { type: 'boolean' },
      notes: { type: 'string', nullable: true },
    },
  },
}

module.exports = subscriptionSchemas

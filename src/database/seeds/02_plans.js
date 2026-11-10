/** Plan default. Upsert berdasarkan code (hanya yang belum dihapus). */
const PLANS = [
  {
    code: 'basic',
    name: 'Basic',
    max_users: 10,
    max_shipments_per_month: 1000,
    features: {
      tracking: true, driver_app: true, reports: false, api_access: false
    },
    price_monthly: 0,
  },
  {
    code: 'pro',
    name: 'Pro',
    max_users: 50,
    max_shipments_per_month: 10000,
    features: {
      tracking: true, driver_app: true, reports: true, api_access: false
    },
    price_monthly: 0,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    max_users: null,
    max_shipments_per_month: null,
    features: {
      tracking: true, driver_app: true, reports: true, api_access: true
    },
    price_monthly: 0,
  },
]

exports.seed = async (knex) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const plan of PLANS) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await knex('plans').where({ code: plan.code, is_deleted: false }).first()
    if (!exists) {
      // eslint-disable-next-line no-await-in-loop
      await knex('plans').insert({ ...plan, features: JSON.stringify(plan.features) })
    }
  }
}

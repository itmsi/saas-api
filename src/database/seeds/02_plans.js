/**
 * Plan bawaan. Insert jika code belum ada (hanya yang belum dihapus); data yang sudah ada tidak ditimpa.
 *
 * Plan `default` (is_default = true) dipakai POST /clients saat plan_code tidak diisi.
 * Subscription-nya dibuat `active` tanpa end_date (berlaku tanpa batas waktu).
 * Default bisa dipindah ke plan lain lewat PATCH /plans/:id { is_default: true }.
 */
const PLANS = [
  {
    code: 'default',
    name: 'Default',
    max_users: null,
    max_shipments_per_month: null,
    features: {
      tracking: true, driver_app: true, reports: true, api_access: true
    },
    price_monthly: 0,
    is_default: true,
  },
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
      const hasDefault = plan.is_default && await knex('plans').where({ is_default: true, is_deleted: false }).first('id')
      // eslint-disable-next-line no-await-in-loop
      await knex('plans').insert({
        ...plan, is_default: Boolean(plan.is_default && !hasDefault), features: JSON.stringify(plan.features),
      })
      console.log(`[seed] plan ${plan.code} dibuat`)
    }
  }
}

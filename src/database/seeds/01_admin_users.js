/**
 * Admin MSI awal (superadmin). Dibaca dari env:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD
 * Aman dijalankan ulang: tidak menimpa admin yang sudah ada.
 */
const bcrypt = require('bcrypt')
const config = require('../../config')

exports.seed = async (knex) => {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@msi.local').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password) {
    console.log('[seed] SEED_ADMIN_PASSWORD kosong, admin awal dilewati')
    return
  }

  const exists = await knex('admin_users').whereRaw('lower(email) = ?', [email]).where('is_deleted', false).first()
  if (exists) {
    console.log(`[seed] admin ${email} sudah ada`)
    return
  }

  await knex('admin_users').insert({
    email,
    name: process.env.SEED_ADMIN_NAME || 'Super Admin MSI',
    password_hash: await bcrypt.hash(password, config.auth.bcryptRounds),
    role: 'superadmin',
  })
  console.log(`[seed] admin ${email} dibuat`)
}

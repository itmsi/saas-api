const path = require('path')
const config = require('../config')

// Satu konfigurasi untuk semua environment; bedakan lewat isi .env
// Migrasi di sini hanya untuk DB saas_core (bukan DB tenant).
module.exports = {
  ...config.db,
  migrations: {
    tableName: 'knex_migrations',
    directory: path.join(__dirname, 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },
}

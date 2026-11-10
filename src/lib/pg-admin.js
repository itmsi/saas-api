/**
 * Koneksi role provisioner per cluster (HANYA dipakai proses saas-worker).
 *
 * Kredensial dibaca dari env dengan prefix db_clusters.admin_secret_ref, contoh
 * admin_secret_ref = CLUSTER_PG_PROD_01:
 *   CLUSTER_PG_PROD_01_USER=lg_provisioner
 *   CLUSTER_PG_PROD_01_PASSWORD=***
 *   CLUSTER_PG_PROD_01_DATABASE=postgres   (opsional, default postgres)
 *   CLUSTER_PG_PROD_01_SSL=false           (opsional)
 *
 * Role provisioner butuh: LOGIN CREATEDB CREATEROLE (bukan superuser).
 */
const { Client, escapeIdentifier, escapeLiteral } = require('pg')
const config = require('../config')
const { permanent } = require('./errors')

const credentials = (cluster) => {
  const prefix = cluster.admin_secret_ref
  const user = process.env[`${prefix}_USER`]
  const password = process.env[`${prefix}_PASSWORD`]
  if (!user || password === undefined) {
    throw permanent(`Kredensial provisioner ${prefix}_USER / ${prefix}_PASSWORD tidak ada di env worker`, {
      code: 'PROVISIONER_SECRET_MISSING',
    })
  }
  return {
    user,
    password,
    database: process.env[`${prefix}_DATABASE`] || 'postgres',
    ssl: ['true', '1'].includes(String(process.env[`${prefix}_SSL`]).toLowerCase()) ? { rejectUnauthorized: false } : false,
  }
}

/**
 * Jalankan fn(client) dengan koneksi provisioner ke cluster (langsung ke Postgres, bukan pooler).
 * @param {object} cluster  baris db_clusters
 * @param {(client: import('pg').Client) => Promise<any>} fn
 * @param {{ database?: string }} [opts]  connect ke database lain (mis. DB tenant)
 */
const withAdmin = async (cluster, fn, { database } = {}) => {
  const cred = credentials(cluster)
  const client = new Client({
    host: cluster.host,
    port: cluster.port,
    user: cred.user,
    password: cred.password,
    database: database || cred.database,
    ssl: cred.ssl,
    connectionTimeoutMillis: 10000,
    application_name: `saas-worker:${config.worker.id}`,
  })
  client.on('error', () => {}) // error koneksi ditangani lewat promise query
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

/** Identifier aman: hanya huruf kecil, angka, underscore */
const ident = (name) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name || '')) {
    throw permanent(`Nama identifier tidak valid: ${name}`, { code: 'INVALID_IDENTIFIER' })
  }
  return escapeIdentifier(name)
}

const literal = (value) => escapeLiteral(String(value))

module.exports = {
  withAdmin, ident, literal, credentials,
}

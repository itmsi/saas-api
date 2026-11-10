/**
 * Konteks request yang diteruskan controller ke service.
 * Service TIDAK menerima objek req Express secara langsung, supaya:
 *  - bisa dipanggil dari tempat lain (worker, script, test)
 *  - jelas data apa saja dari request yang dipakai
 *
 * Field-nya sengaja sama dengan req (actorId, ip, id) sehingga bisa langsung
 * dipakai lib/audit.
 *
 * @param {import('express').Request} req
 * @returns {{ actorId: string|null, role: string|null, ip: string|null, id: string, userAgent: string|null }}
 */
const ctxOf = (req) => ({
  actorId: req.actorId || null,
  role: req.auth?.role || null,
  ip: req.ip || null,
  id: req.id,
  userAgent: req.headers['user-agent'] || null,
})

module.exports = { ctxOf }

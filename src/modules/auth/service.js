const crypto = require('crypto')
const bcrypt = require('bcrypt')
const config = require('../../config')
const db = require('../../database')
const { stamp, alive } = require('../../database')
const { AppError } = require('../../utils/errors')
const { toMs } = require('../../utils/duration')
const { signAccessToken } = require('../../middlewares/auth')
const { sha256 } = require('../../lib/crypto')
const audit = require('../../lib/audit')

const PROFILE_COLUMNS = ['id', 'email', 'name', 'role', 'is_active', 'last_login_at', 'created_at', 'updated_at']

// Dipakai saat email tidak ditemukan, supaya waktu respons sama (anti user enumeration)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10)

/**
 * Refresh token opaque: "<id row>.<random>" — yang disimpan hanya sha256(random).
 */
const issueTokens = async (admin, ctx, trx = db) => {
  const secret = crypto.randomBytes(32).toString('base64url')
  const refreshTtlMs = toMs(config.jwt.refreshTtl)
  const [row] = await trx('admin_refresh_tokens').insert(stamp.create({
    admin_user_id: admin.id,
    token_hash: sha256(secret),
    expires_at: new Date(Date.now() + refreshTtlMs),
    user_agent: ctx.userAgent?.slice(0, 255) || null,
    ip_address: ctx.ip?.slice(0, 45) || null,
  }, admin.id)).returning(['id'])

  return {
    token_type: 'Bearer',
    access_token: signAccessToken(admin),
    expires_in: Math.floor(toMs(config.jwt.accessTtl) / 1000),
    refresh_token: `${row.id}.${secret}`,
    refresh_expires_in: Math.floor(refreshTtlMs / 1000),
  }
}

const findRefreshToken = async (token) => {
  const [id, secret] = String(token || '').split('.')
  if (!id || !secret || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('INVALID_REFRESH_TOKEN')
  const row = await alive(db('admin_refresh_tokens')).where({ id }).first()
  const valid = row
    && !row.revoked_at
    && new Date(row.expires_at) > new Date()
    && crypto.timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(sha256(secret)))
  if (!valid) throw new AppError('INVALID_REFRESH_TOKEN')
  return row
}

const login = async ({ email, password }, ctx) => {
  const admin = await alive(db('admin_users')).whereRaw('lower(email) = ?', [email.toLowerCase()]).first()
  const match = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH)
  if (!admin || !match || !admin.is_active) {
    await audit.record({
      actorType: 'system', action: 'auth.login_failed', targetType: 'admin_user', targetId: admin?.id, after: { email }, ctx,
    })
    throw new AppError('INVALID_CREDENTIALS')
  }

  const tokens = await db.transaction(async (trx) => {
    await trx('admin_users').where({ id: admin.id }).update(stamp.update({ last_login_at: trx.fn.now() }, admin.id))
    return issueTokens(admin, ctx, trx)
  })
  await audit.record({
    actorType: 'admin', actorId: admin.id, action: 'auth.login', targetType: 'admin_user', targetId: admin.id, ctx,
  })

  return {
    ...tokens,
    admin: {
      id: admin.id, email: admin.email, name: admin.name, role: admin.role
    }
  }
}

/** Rotasi: token lama dicabut, token baru diterbitkan */
const refresh = async ({ refresh_token }, ctx) => {
  const row = await findRefreshToken(refresh_token)
  const admin = await alive(db('admin_users')).where({ id: row.admin_user_id, is_active: true }).first()
  if (!admin) throw new AppError('INVALID_REFRESH_TOKEN')

  return db.transaction(async (trx) => {
    const revoked = await trx('admin_refresh_tokens')
      .where({ id: row.id }).whereNull('revoked_at')
      .update(stamp.update({ revoked_at: trx.fn.now() }, admin.id))
    if (!revoked) throw new AppError('INVALID_REFRESH_TOKEN') // dipakai bersamaan
    return issueTokens(admin, ctx, trx)
  })
}

const logout = async ({ refresh_token }, ctx) => {
  const row = await findRefreshToken(refresh_token).catch(() => null)
  if (row && row.admin_user_id === ctx.actorId) {
    await db('admin_refresh_tokens').where({ id: row.id }).update(stamp.update({ revoked_at: db.fn.now() }, ctx.actorId))
  }
  await audit.fromRequest(ctx, 'auth.logout', { type: 'admin_user', id: ctx.actorId })
  return { logged_out: true }
}

const me = async (adminId) => {
  const admin = await alive(db('admin_users')).where({ id: adminId }).first(PROFILE_COLUMNS)
  if (!admin || !admin.is_active) throw new AppError('UNAUTHORIZED')
  return admin
}

module.exports = {
  login, refresh, logout, me, PROFILE_COLUMNS,
}

const config = require('../../config')
const db = require('../../database')
const { stamp, alive, publicRow } = require('../../database')
const { AppError } = require('../../utils/errors')
const { pageOf, pageMeta } = require('../../utils/response')
const { encrypt, decrypt, randomPassword } = require('../../lib/crypto')
const { createJob } = require('../../lib/jobs')
const audit = require('../../lib/audit')
const cache = require('../../lib/cache')

const CURRENT_SUBSCRIPTION = ['trial', 'active', 'past_due']
const CLIENT_COLUMNS = [
  'id', 'client_code', 'name', 'legal_name', 'email', 'phone', 'address', 'npwp', 'status', 'status_reason',
  'settings', 'created_at', 'created_by', 'updated_at', 'updated_by',
]
const DB_CONFIG_PUBLIC = [
  'id', 'client_id', 'cluster_id', 'db_name', 'db_owner_username', 'db_app_username', 'encryption_key_version',
  'system_user_username', 'schema_version', 'pool_max', 'password_rotated_at', 'provisioned_at', 'dropped_at',
  'created_at', 'created_by', 'updated_at', 'updated_by',
]

/** Nama DB & role dari client_code (tanda '-' diganti '_' agar identifier Postgres tidak perlu quote) */
const dbNamesFor = (code) => {
  const base = `lg_${code.replace(/-/g, '_')}`
  return { db_name: base, db_owner_username: `${base}_owner`, db_app_username: `${base}_app` }
}

const findClient = async (id, trx = db) => {
  const row = await alive(trx('clients')).where({ id }).first(CLIENT_COLUMNS)
  if (!row) throw new AppError('CLIENT_NOT_FOUND')
  return row
}

const currentSubscription = (clientId, trx = db) => alive(trx('subscriptions as s'), 's')
  .join('plans as p', 'p.id', 's.plan_id')
  .where('s.client_id', clientId)
  .whereIn('s.status', CURRENT_SUBSCRIPTION)
  .first('s.id', 's.status', 's.start_date', 's.end_date', 's.trial_end_date', 's.auto_renew', 'p.id as plan_id', 'p.code as plan_code', 'p.name as plan_name')

/** Pilih cluster: yang diminta, atau cluster aktif dengan tenant paling sedikit. Dikunci FOR UPDATE. */
const pickCluster = async (trx, clusterId) => {
  const q = alive(trx('db_clusters'))
    .where({ status: 'active' })
    .whereRaw('tenant_count < max_tenants')
    .forUpdate()
  if (clusterId) {
    const row = await q.where({ id: clusterId }).first()
    if (!row) throw new AppError('CLUSTER_NOT_AVAILABLE', { details: { cluster_id: clusterId } })
    return row
  }
  const row = await q.orderBy('tenant_count').orderBy('created_at').first()
  if (!row) throw new AppError('NO_CLUSTER_AVAILABLE')
  return row
}

const list = async (query) => {
  const p = pageOf(query)
  const base = alive(db('clients as c'), 'c')
    .leftJoin('tenant_db_configs as t', function joinConfig() {
      this.on('t.client_id', 'c.id').andOn('t.is_deleted', db.raw('false'))
    })
    .leftJoin('subscriptions as s', function joinSub() {
      this.on('s.client_id', 'c.id').andOn('s.is_deleted', db.raw('false'))
        .andOnIn('s.status', CURRENT_SUBSCRIPTION)
    })
    .leftJoin('plans as p', 'p.id', 's.plan_id')

  if (query.status) base.whereIn('c.status', [].concat(query.status))
  if (query.cluster_id) base.where('t.cluster_id', query.cluster_id)
  if (query.plan_code) base.where('p.code', query.plan_code)
  if (query.search) {
    const s = `%${query.search}%`
    base.where((w) => w.whereILike('c.client_code', s).orWhereILike('c.name', s).orWhereILike('c.email', s))
  }

  const [{ count }] = await base.clone().countDistinct({ count: 'c.id' })
  const rows = await base
    .select(
      ...CLIENT_COLUMNS.map((c) => `c.${c}`),
      't.cluster_id',
      't.db_name',
      't.schema_version',
      't.provisioned_at',
      's.status as subscription_status',
      's.end_date as subscription_end_date',
      'p.code as plan_code',
    )
    .orderBy(`c.${query.sort || 'created_at'}`, query.order || 'desc')
    .limit(p.limit)
    .offset(p.offset)
  return { rows, meta: pageMeta(p, Number(count)) }
}

/**
 * Alur 4.1: client + subscription + config DB + job + outbox dalam SATU transaksi.
 */
const create = async (body, ctx) => {
  const actor = ctx.actorId
  const result = await db.transaction(async (trx) => {
    if (await alive(trx('clients')).where({ client_code: body.client_code }).first('id')) {
      throw new AppError('CLIENT_CODE_TAKEN')
    }
    const plan = await alive(trx('plans')).where({ code: body.plan_code, is_active: true }).first()
    if (!plan) throw new AppError('VALIDATION_ERROR', { details: [{ field: 'plan_code', message: 'Plan tidak ditemukan / tidak aktif' }] })

    const names = dbNamesFor(body.client_code)
    const nameTaken = await alive(trx('tenant_db_configs')).where({ db_name: names.db_name }).first('id')
    if (nameTaken) throw new AppError('CLIENT_CODE_TAKEN', { details: { db_name: names.db_name } })

    const cluster = await pickCluster(trx, body.cluster_id)

    const [client] = await trx('clients').insert(stamp.create({
      client_code: body.client_code,
      name: body.name,
      legal_name: body.legal_name,
      email: body.email,
      phone: body.phone,
      address: body.address,
      npwp: body.npwp,
      status: 'provisioning',
      settings: JSON.stringify(body.settings || {}),
    }, actor)).returning(CLIENT_COLUMNS)

    const sub = body.subscription || {}
    const [subscription] = await trx('subscriptions').insert(stamp.create({
      client_id: client.id,
      plan_id: plan.id,
      status: sub.status || 'trial',
      start_date: sub.start_date || new Date(),
      end_date: sub.end_date || null,
      trial_end_date: sub.trial_end_date || null,
      auto_renew: sub.auto_renew ?? true,
      notes: sub.notes || null,
    }, actor)).returning(['id', 'status', 'start_date', 'end_date', 'trial_end_date'])

    await trx('tenant_db_configs').insert(stamp.create({
      client_id: client.id,
      cluster_id: cluster.id,
      ...names,
      db_owner_password_enc: encrypt(randomPassword()),
      db_app_password_enc: encrypt(randomPassword()),
      encryption_key_version: config.tenantDb.encKeyVersion,
      system_user_username: config.tenantDb.defaultSystemUser,
      system_user_password_enc: encrypt(randomPassword(18)),
      pool_max: body.pool_max || config.tenantDb.defaultPoolMax,
    }, actor))

    const job = await createJob(trx, {
      clientId: client.id, type: 'provision', requestedBy: actor,
    })

    const newCount = cluster.tenant_count + 1
    await trx('db_clusters').where({ id: cluster.id }).update(stamp.update({
      tenant_count: newCount,
      status: newCount >= cluster.max_tenants ? 'full' : cluster.status,
    }, actor))

    await audit.record({
      actorType: 'admin',
      actorId: actor,
      action: 'client.create',
      targetType: 'client',
      targetId: client.id,
      after: {
        ...client, plan_code: plan.code, cluster_id: cluster.id, job_id: job.id
      },
      ctx,
      trx,
    })

    return {
      client: { ...client, plan_code: plan.code, subscription },
      cluster: { id: cluster.id, name: cluster.name },
      db: { db_name: names.db_name },
      job_id: job.id,
      job_status: job.status,
    }
  })
  return result
}

const detail = async (id) => {
  const client = await findClient(id)
  const [subscription, dbConfig, lastJob] = await Promise.all([
    currentSubscription(id),
    alive(db('tenant_db_configs as t'), 't')
      .join('db_clusters as k', 'k.id', 't.cluster_id')
      .where('t.client_id', id)
      .first('t.db_name', 't.db_owner_username', 't.db_app_username', 't.schema_version', 't.pool_max', 't.provisioned_at', 't.password_rotated_at', 't.dropped_at', 'k.id as cluster_id', 'k.name as cluster_name', 'k.host as cluster_host'),
    db('provisioning_jobs').where({ client_id: id, is_deleted: false }).orderBy('queued_at', 'desc')
      .first('id', 'type', 'status', 'failed_step', 'error_message', 'queued_at', 'finished_at'),
  ])
  return {
    ...client, subscription: subscription || null, db: dbConfig || null, last_job: lastJob || null,
  }
}

const update = async (id, body, ctx) => {
  const before = await findClient(id)
  const data = { ...body }
  if (data.settings) data.settings = JSON.stringify(data.settings)
  const [row] = await db('clients').where({ id }).update(stamp.update(data, ctx.actorId)).returning(CLIENT_COLUMNS)
  await cache.invalidateTenant({ client_id: id, client_code: before.client_code }, 'client_updated')
  await audit.fromRequest(ctx, 'client.update', { type: 'client', id }, { before, after: row })
  return row
}

/** Alur 4.6: suspend / activate */
const STATUS_TRANSITIONS = { suspended: ['active'], active: ['suspended'] }

const updateStatus = async (id, { status, reason }, ctx) => {
  const before = await findClient(id)
  if (!STATUS_TRANSITIONS[status].includes(before.status)) {
    throw new AppError('INVALID_STATE', { details: { from: before.status, to: status } })
  }
  const [row] = await db('clients').where({ id }).update(stamp.update({
    status, status_reason: reason || null,
  }, ctx.actorId)).returning(CLIENT_COLUMNS)
  await cache.invalidateTenant({ client_id: id, client_code: before.client_code }, `client_${status}`)
  await audit.fromRequest(ctx, status === 'suspended' ? 'client.suspend' : 'client.activate', { type: 'client', id }, {
    before: { status: before.status }, after: { status, reason },
  })
  return row
}

/** Buat job maintenance untuk client (cek status client dulu) */
const enqueueJob = async (id, ctx, {
  type, allowedStatuses, params = {}, newStatus, action,
}) => {
  const result = await db.transaction(async (trx) => {
    const client = await alive(trx('clients')).where({ id }).forUpdate().first()
    if (!client) throw new AppError('CLIENT_NOT_FOUND')
    if (!allowedStatuses.includes(client.status)) {
      throw new AppError('INVALID_STATE', { details: { status: client.status, allowed: allowedStatuses } })
    }
    const job = await createJob(trx, {
      clientId: id, type, params, requestedBy: ctx.actorId,
    })
    if (newStatus) {
      await trx('clients').where({ id }).update(stamp.update({ status: newStatus }, ctx.actorId))
    }
    await audit.record({
      actorType: 'admin', actorId: ctx.actorId, action, targetType: 'client', targetId: id, after: { job_id: job.id, params }, ctx, trx,
    })
    return { client, job }
  })
  if (newStatus) await cache.invalidateTenant(result.client, newStatus)
  return {
    client_id: id, job_id: result.job.id, job_type: type, job_status: result.job.status
  }
}

const deprovision = async (id, body, ctx) => {
  const client = await findClient(id)
  if (body.confirm_client_code !== client.client_code) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'confirm_client_code', message: 'Harus sama dengan client_code' }] })
  }
  return enqueueJob(id, ctx, {
    type: 'deprovision',
    allowedStatuses: ['active', 'suspended', 'provisioning_failed'],
    params: { backup: body.backup },
    newStatus: 'deprovisioning',
    action: 'client.deprovision',
  })
}

const rotateDbPassword = (id, ctx) => enqueueJob(id, ctx, {
  type: 'rotate_password', allowedStatuses: ['active', 'suspended'], action: 'client.rotate_db_password',
})

const resetSystemUser = (id, ctx) => enqueueJob(id, ctx, {
  type: 'reset_system_user', allowedStatuses: ['active', 'suspended'], action: 'client.reset_system_user',
})

const dbConfig = async (id) => {
  await findClient(id)
  const row = await alive(db('tenant_db_configs as t'), 't')
    .join('db_clusters as k', 'k.id', 't.cluster_id')
    .where('t.client_id', id)
    .first(...DB_CONFIG_PUBLIC.map((c) => `t.${c}`), 'k.name as cluster_name', 'k.host', 'k.port', 'k.pooler_host', 'k.pooler_port')
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

/** Superadmin: lihat password ghost user. Selalu tercatat di audit_logs. */
const revealSystemUser = async (id, ctx) => {
  const client = await findClient(id)
  const row = await alive(db('tenant_db_configs')).where({ client_id: id }).first('system_user_username', 'system_user_password_enc')
  if (!row) throw new AppError('NOT_FOUND')
  await audit.fromRequest(ctx, 'client.reveal_system_user', { type: 'client', id }, {
    after: { client_code: client.client_code, username: row.system_user_username },
  })
  return {
    client_code: client.client_code,
    username: row.system_user_username,
    password: decrypt(row.system_user_password_enc),
  }
}

const jobs = async (id, query) => {
  await findClient(id)
  const p = pageOf(query)
  const base = db('provisioning_jobs').where({ client_id: id, is_deleted: false })
  if (query.type) base.where({ type: query.type })
  if (query.status) base.where({ status: query.status })
  const [{ count }] = await base.clone().count({ count: '*' })
  const rows = await base.orderBy('queued_at', 'desc').limit(p.limit).offset(p.offset)
  return { rows: rows.map(publicRow), meta: pageMeta(p, Number(count)) }
}

const auditLogs = async (id, query) => {
  await findClient(id)
  const p = pageOf(query)
  const base = alive(db('audit_logs')).where({ target_type: 'client', target_id: id })
  const [{ count }] = await base.clone().count({ count: '*' })
  const rows = await base.orderBy('id', 'desc').limit(p.limit).offset(p.offset)
  return { rows: rows.map(publicRow), meta: pageMeta(p, Number(count)) }
}

module.exports = {
  list,
  create,
  detail,
  update,
  updateStatus,
  deprovision,
  rotateDbPassword,
  resetSystemUser,
  dbConfig,
  revealSystemUser,
  jobs,
  auditLogs,
  findClient,
  currentSubscription,
  dbNamesFor,
  CURRENT_SUBSCRIPTION,
}

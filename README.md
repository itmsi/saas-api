# logistics-saas-api

Control plane SaaS logistik: client (tenant), plan & subscription, registry cluster DB, config DB tenant (terenkripsi), dan **worker provisioning** (create role & database → panggil `logistics-api` untuk migrasi, seeder, verifikasi → rollback jika gagal).

Spesifikasi lengkap: [logistics-saas-api.md](logistics-saas-api.md).

## Stack

Node.js 20+ · Express 4 · PostgreSQL (`saas_core`, Knex) · RabbitMQ (amqplib) · Redis (ioredis) · JWT · Joi · Swagger UI

## Satu repo, dua proses

| Proses | Perintah | Fungsi |
|---|---|---|
| `saas-api` | `npm run start:api` | HTTP API admin MSI (`/api/v1`) + endpoint internal (`/internal`) |
| `saas-worker` | `npm run start:worker` | Outbox relay + consumer RabbitMQ (provisioning) + health server `:3100` |

Kredensial role provisioner cluster (`CLUSTER_*_USER/PASSWORD`) **hanya** dipasang di env `saas-worker`.

## Standar tabel

Setiap tabel di `saas_core` wajib punya kolom:

| Kolom | Tipe | Isi |
|---|---|---|
| `created_at`, `updated_at` | timestamptz | `updated_at` diisi otomatis oleh trigger |
| `created_by`, `updated_by` | uuid | id `admin_users`; `NULL` = sistem / worker |
| `is_deleted` | boolean, default `false` | soft delete |
| `deleted_at`, `deleted_by` | timestamptz, uuid | diisi saat soft delete |

- Di migrasi: `standardColumns(knex, t)` dari `src/database/columns.js`.
- Di kode: `stamp.create(data, req.actorId)`, `stamp.update(data, req.actorId)`, `stamp.remove(req.actorId)` dan filter `alive(query)` dari `src/database`.
- Data tidak dihapus fisik. Unique index dibuat parsial `WHERE is_deleted = false`.
- Kolom `is_deleted`, `deleted_at`, `deleted_by` disembunyikan dari response API (`publicRow`).

## Struktur

```
src/
├── api.js                     # entry proses API
├── worker.js                  # entry proses worker
├── app.js                     # express app
├── config/index.js            # SEMUA env dibaca di sini
├── database/
│   ├── index.js               # knex + helper stamp / alive / publicRow
│   ├── columns.js             # standar kolom tabel
│   ├── migrations/            # migrasi saas_core (bukan DB tenant)
│   └── seeds/                 # admin awal, plan default
├── modules/
│   ├── auth/  admin-users/  plans/  clusters/  clients/  subscriptions/
│   ├── provisioning/          # list, detail, retry, cleanup job
│   ├── migrations/            # rollout migrasi
│   ├── internal/              # resolve tenant untuk logistics-api
│   └── health/
├── worker/
│   ├── outbox-relay.js        # outbox_events -> RabbitMQ (confirm channel)
│   ├── consumer.js            # 3 queue, manual ack, advisory lock per client
│   ├── runner.js              # step berurutan, retry transient, rollback mundur
│   ├── recovery.js            # WORKER_INTERRUPTED
│   ├── health.js              # /health + /clusters/:id/test-connection
│   ├── jobs/index.js          # kebijakan rollback & hook gagal per tipe job
│   └── steps/                 # create-roles, create-database, grant-privileges,
│                              # run-migrations, run-seeders, verify, finalize, maintenance
├── clients/logistics-api.client.js
├── lib/                       # crypto (AES-256-GCM), cache, rabbit, pg-admin, lock,
│                              # errors (transient/permanent), audit, jobs, job-plans
├── middlewares/               # auth (JWT admin), internal-key, validate, request-id, error-handler
├── static/                    # Swagger / OpenAPI (/documentation)
│   ├── index.js               # info, servers, security, penggabung
│   ├── helpers.js             # helper envelope { success, data, meta } & $ref
│   ├── schema/<modul>.js      # model data (components.schemas), common.js = envelope, error, kolom standar
│   └── path/<modul>.js        # endpoint per modul
└── utils/
```

## Struktur modul

Setiap modul di `src/modules/<nama>/` berisi file yang sama:

| File | Isi | Boleh tahu Express? |
|---|---|---|
| `index.js` | Route saja: path + middleware (`authenticate`, role, `validate`) + `controller.x`, dengan komentar `@route / @desc / @access` | ya |
| `validation.js` | Skema Joi (`list`, `create`, `update`, `idParam`, …) | tidak |
| `controller.js` | Baca `req` (`req.body`, `req.valid.params/query`), panggil service dengan `ctxOf(req)`, kirim `ok()` / `created()` / `accepted()`. Dibungkus `wrapAll()` | ya |
| `service.js` | Aturan bisnis, query Knex, transaksi, audit, cache. Lempar `new AppError('KODE')` | **tidak** — menerima `ctx`, bukan `req` |

Aturan:

- **Tidak ada `try/catch` di controller.** Error dari service otomatis diteruskan `wrapAll` ke `middlewares/error-handler.js` dan diformat seragam.
- **Service menerima `ctx`** (`{ actorId, role, ip, id }` dari `utils/context.ctxOf`) untuk mengisi `created_by` / `updated_by` / `deleted_by` dan audit. Karena tidak bergantung pada Express, service bisa dipanggil dari worker atau test.
- Selalu pakai `stamp.create / stamp.update / stamp.remove` dan `alive(query)` untuk kolom standar.

Contoh modul baru:

```js
// index.js
router.use(authenticate)
router.get('/', validate({ query: schema.list }), controller.list)
router.post('/', canWrite, validate({ body: schema.create }), controller.create)

// controller.js
const create = async (req, res) => created(res, await service.create(req.body, ctxOf(req)))
module.exports = wrapAll({ list, create })

// service.js
const create = async (body, ctx) => {
  const [row] = await db('x').insert(stamp.create(body, ctx.actorId)).returning('*')
  await audit.fromRequest(ctx, 'x.create', { type: 'x', id: row.id }, { after: row })
  return publicRow(row)
}
```

Daftarkan router di `src/routes/v1.js`, lalu dokumentasikan di Swagger: endpoint di `src/static/path/<modul>.js`, model data di `src/static/schema/<modul>.js`, dan daftarkan keduanya di `src/static/index.js`.

## Menjalankan lokal

Butuh PostgreSQL, RabbitMQ, Redis (atau `docker compose --profile local-infra up -d`).

```bash
cp .env.example .env        # isi DB, TENANT_DB_ENC_KEY, INTERNAL_*_KEY, JWT_ACCESS_SECRET, SEED_ADMIN_PASSWORD
npm install
npm run migrate
npm run seed                # superadmin + plan basic/pro/enterprise
npm run dev:api             # http://localhost:9061/documentation
npm run dev:worker          # terminal lain
```

Lalu:

1. `POST /api/v1/auth/login`
2. `POST /api/v1/clusters` dengan `admin_secret_ref` = prefix env provisioner (mis. `CLUSTER_PG_PROD_01`)
3. `POST /api/v1/clusters/:id/test-connection`
4. `POST /api/v1/clients` → `202` + `job_id` → pantau `GET /api/v1/provisioning-jobs/:id`

Role provisioner di cluster:

```sql
CREATE ROLE lg_provisioner LOGIN PASSWORD '***' CREATEDB CREATEROLE;
```

## Docker

```bash
docker network create infra_net   # sekali
docker compose up -d --build      # saas-api + saas-worker
docker compose exec saas-api npm run migrate
docker compose exec saas-api npm run seed
```

`saas-worker` keluar (exit 1) jika koneksi RabbitMQ putus dan di-restart oleh Docker. Job yang terpotong ditandai `WORKER_INTERRUPTED` lalu bisa di-retry.

## Kontrak dengan logistics-api

- logistics-api memanggil `GET /internal/tenants/:client_code/resolve` (header `X-Internal-Key: INTERNAL_API_KEY`) dan `.../by-id/:client_id/resolve?scope=provisioning` (`INTERNAL_PROVISIONING_KEY`).
- Password di response berupa `password_enc`: AES-256-GCM, `base64(iv[12] | tag[16] | ciphertext)`, key `TENANT_DB_ENC_KEY` (32 byte base64) yang sama.
- Worker memanggil `POST {LOGISTICS_API_INTERNAL_URL}/tenants/:id/migrate`, `/seed`, `GET /verify`, `POST /system-user/reset`, `GET /migrations/status` dengan header `X-Internal-Key`, `X-Request-ID`, `Idempotency-Key`. Response boleh polos atau dibungkus `{ success, data }`.
- Invalidasi: `DEL tenant:{code}`, `tenant:id:{id}` + publish channel `tenant-invalidate`.

## Role admin

| Role | Akses |
|---|---|
| `superadmin` | semua, termasuk admin users, cluster, reveal system user |
| `operator` | baca & tulis client, plan, subscription, job, rollout |
| `viewer` | hanya GET |

## Format response

```json
{ "success": true, "data": {}, "meta": { "request_id": "..." } }
{ "success": false, "error": { "code": "CLIENT_CODE_TAKEN", "message": "...", "http_status": 409 }, "meta": { "request_id": "..." } }
```

# logistics-saas-api

> Control plane SaaS logistik. Mengelola client (tenant), subscription, cluster database, konfigurasi DB tenant, dan **menjalankan worker provisioning** (create role & database, lalu memanggil `logistics-api` untuk migrasi & seeder).
> Status dokumen: **DRAFT v2 untuk review** (provisioning-service dilebur ke repo ini)

---

## 1. Tanggung Jawab

| Termasuk | Tidak termasuk |
|---|---|
| CRUD client / tenant | File migrasi & seeder DB tenant (ada di `logistics-api`) |
| Plan & subscription | Login user client (`logistics-api`) |
| Registry cluster DB (host Postgres) | Operasional logistik (`logistics-api`) |
| Menyimpan config DB tenant (terenkripsi) | |
| Membuat job provisioning (outbox → RabbitMQ) | |
| **Worker:** consume job, create role & database, grant | |
| **Worker:** hit `logistics-api` untuk migrasi, seeder, verifikasi | |
| **Worker:** rollback (drop DB & role) jika gagal | |
| Retry / cleanup job gagal secara manual | |
| Endpoint internal resolve tenant untuk `logistics-api` | |
| Invalidasi cache tenant (Redis) | |
| Rollout migrasi ke semua tenant | |

**Tech stack:** Node.js, Express.js, PostgreSQL (DB `saas_core`), RabbitMQ, Redis, Kong Gateway.

### Satu repo, dua proses

Repo ini dijalankan sebagai **dua proses/container** dari image yang sama:

| Proses | Perintah | Fungsi |
|---|---|---|
| `saas-api` | `npm run start:api` | HTTP API untuk admin MSI + endpoint internal |
| `saas-worker` | `npm run start:worker` | Outbox relay + consumer RabbitMQ (provisioning) |

Alasan dipisah: job provisioning bisa berjalan lama (migrasi). Jika digabung dalam satu proses, restart/deploy API akan memotong job yang sedang berjalan, dan worker bisa di-scale terpisah dari API.

---

## 2. Posisi dalam Arsitektur

```
 Admin MSI ──► Kong ──► saas-api ──► PostgreSQL saas_core
                           │  (transaksi: client + config + job + outbox)
                           ▼
                      saas-worker ── outbox relay ──► RabbitMQ (exchange: tenant)
                           ▲                                 │
                           └──────── consume ────────────────┘
                           │
                           ├─(1) CREATE ROLE / CREATE DATABASE / GRANT ──► Postgres cluster
                           │
                           └─(2) POST /internal/tenants/:id/migrate ──► logistics-api
                                 POST /internal/tenants/:id/seed            │
                                 GET  /internal/tenants/:id/verify          │
                                                                            ▼
                                     logistics-api ── resolve (scope=provisioning) ──► saas-api
                                                   └─ jalankan migrasi & seeder ──► DB tenant

 User client ──► Kong ──► logistics-api ──► Redis tenant:{code} / saas-api resolve ──► DB tenant
```

---

## 3. Role Database per Tenant

Setiap tenant punya **dua role** Postgres:

| Role | Contoh | Hak | Dipakai oleh |
|---|---|---|---|
| Owner | `lg_ogo_owner` | Owner database & schema, boleh DDL (CREATE/ALTER TABLE) | `logistics-api` **hanya** saat migrasi & seeder |
| App | `lg_ogo_app` | SELECT, INSERT, UPDATE, DELETE saja | `logistics-api` untuk request normal user |

Dengan begini, request user biasa tidak pernah memakai role yang bisa mengubah struktur tabel, dan `logistics-api` tidak perlu memegang role provisioner cluster (`CREATEDB`/`CREATEROLE`). Role provisioner hanya ada di `saas-worker`.

---

## 4. Alur Proses

### 4.1 Create Client

1. Admin MSI `POST /api/v1/clients`.
2. Validasi: `client_code` unik (`^[a-z0-9-]{3,30}$`), cluster aktif & belum penuh.
3. Dalam **satu transaksi DB**:
   1. Insert `clients` (status `provisioning`).
   2. Insert `subscriptions`.
   3. Generate config DB:
      - `db_name` = `lg_{code}`
      - `db_owner_username` = `lg_{code}_owner`, password random → dienkripsi
      - `db_app_username` = `lg_{code}_app`, password random → dienkripsi
      - `system_user_password` random → dienkripsi (untuk ghost user)
   4. Insert `tenant_db_configs`.
   5. Insert `provisioning_jobs` (type `provision`, status `queued`) + 7 baris `provisioning_steps` (status `pending`).
   6. Insert `outbox_events` (`tenant.provision.requested`, payload `{ job_id, client_id }`).
   7. `db_clusters.tenant_count + 1`.
4. Response `202 Accepted` + `job_id`.

### 4.2 Worker: Proses Provisioning

1. Outbox relay (di `saas-worker`) publish event ke RabbitMQ, lalu set `published_at`.
2. Consumer menerima `{ job_id }` (prefetch 1, manual ack).
3. Cek job: jika status bukan `queued` → `ack` dan berhenti (pesan duplikat).
4. `pg_try_advisory_lock(hashtext(client_id))` di `saas_core`. Gagal → `nack` dan coba lagi nanti.
5. Job `running`, catat `started_at`, `worker_id`, `attempt + 1`.
6. Jalankan step berurutan:

| # | Step | Dijalankan oleh | Aksi | Cek idempotent | Rollback (compensate) |
|---|---|---|---|---|---|
| 1 | `create_roles` | saas-worker | `CREATE ROLE lg_x_owner LOGIN PASSWORD ... NOSUPERUSER NOCREATEDB NOCREATEROLE`<br>`CREATE ROLE lg_x_app LOGIN PASSWORD ... NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 20`<br>`GRANT lg_x_owner TO lg_provisioner` | Cek `pg_roles`; jika ada → `ALTER ROLE ... PASSWORD` | `DROP ROLE IF EXISTS` kedua role |
| 2 | `create_database` | saas-worker | `CREATE DATABASE lg_x OWNER lg_x_owner ENCODING 'UTF8' TEMPLATE template0` | Cek `pg_database` | Terminate koneksi, `DROP DATABASE IF EXISTS lg_x` |
| 3 | `grant_privileges` | saas-worker | `REVOKE ALL ON DATABASE lg_x FROM PUBLIC`<br>`GRANT CONNECT ON DATABASE lg_x TO lg_x_app`<br>Di DB tenant: `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, `ALTER SCHEMA public OWNER TO lg_x_owner`, `GRANT USAGE ON SCHEMA public TO lg_x_app`<br>`ALTER DEFAULT PRIVILEGES FOR ROLE lg_x_owner GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lg_x_app`<br>`ALTER DEFAULT PRIVILEGES FOR ROLE lg_x_owner GRANT USAGE, SELECT ON SEQUENCES TO lg_x_app` | Grant aman diulang | (ikut terhapus saat drop DB) |
| 4 | `run_migrations` | **logistics-api** | `POST /internal/tenants/:client_id/migrate` | Migration tool mencatat migrasi yang sudah jalan | (ikut terhapus saat drop DB) |
| 5 | `run_seeders` | **logistics-api** | `POST /internal/tenants/:client_id/seed` `{ include_system_user: true }` | Seeder upsert (`ON CONFLICT`) | (ikut terhapus saat drop DB) |
| 6 | `verify` | **logistics-api** | `GET /internal/tenants/:client_id/verify` — login pakai role app, cek tabel, role default, system user | Read-only | — |
| 7 | `finalize` | saas-worker | `clients.status='active'`, simpan `schema_version`, `provisioned_at`, hapus cache Redis | Update aman diulang | `clients.status='provisioning_failed'` |

7. Setiap step: set `running` → `success`/`failed`, simpan `message`, `error_message`, `error_detail`, `started_at`, `finished_at`, dan untuk step HTTP juga `http_status` & `response_body` (dipotong maks 10 KB, tanpa data rahasia).
8. Job `success` → `ack`.

### 4.3 Saat Step Gagal (Rollback All)

```
step N gagal
  ├─ step N: status=failed + error
  ├─ job: status=rolling_back, failed_step=N
  ├─ compensate mundur dari step terakhir yg sukses ke step 1
  │     (drop database → drop roles)
  │     sukses → compensated | gagal → compensate_failed (tetap lanjut)
  ├─ semua sukses → job rolled_back
  │  ada gagal    → job rollback_failed (wajib cleanup manual)
  ├─ clients.status = provisioning_failed
  └─ ack (tidak requeue otomatis; menunggu admin memperbaiki lalu retry)
```

**Klasifikasi error:**

| Jenis | Contoh | Tindakan |
|---|---|---|
| Transient | Koneksi Postgres putus, `logistics-api` 502/503/504, timeout jaringan, `ECONNREFUSED` | Retry di step yang sama maks 3x (backoff 2s, 5s, 15s), tanpa rollback |
| Permanent | `logistics-api` 4xx/500 dengan error migrasi, permission denied, syntax error | Langsung rollback |

**Timeout HTTP ke logistics-api:**
- `migrate`: default 10 menit (`LOGISTICS_MIGRATE_TIMEOUT_MS`).
- `seed` & `verify`: default 2 menit.
- Jika timeout tapi migrasi sebenarnya masih berjalan di logistics-api, retry akan menunggu lock di sisi logistics-api, dan migrasi yang sudah selesai tidak diulang (idempotent).

**Opsi debug:** `ROLLBACK_ON_FAILURE=false` → DB dibiarkan apa adanya untuk diperiksa, job status `failed`, dan retry `mode=resume` melanjutkan dari step gagal.

### 4.4 Retry Manual

1. Admin lihat `GET /api/v1/provisioning-jobs/:id` → step gagal + error.
2. Perbaiki penyebab (contoh: bug di file migrasi logistics-api → deploy ulang logistics-api).
3. Pilih:
   - `POST /provisioning-jobs/:id/retry` → job baru. Jika DB sudah di-rollback = provisioning penuh; jika `ROLLBACK_ON_FAILURE=false` = lanjut dari step gagal.
   - `POST /provisioning-jobs/:id/cleanup-and-rerun` → paksa drop DB & role, lalu provisioning dari awal (untuk kasus `rollback_failed`).
4. Job baru punya `parent_job_id` ke job lama.

### 4.5 Rollout Migrasi (rilis baru logistics-api)

Urutan rilis:

1. Tulis migrasi baru di `logistics-api` secara **backward compatible** (expand → contract): tambah kolom/tabel dulu, hapus kolom lama di rilis berikutnya.
2. Deploy `logistics-api` versi baru.
3. Admin `POST /api/v1/migrations/rollout` (`client_ids` kosong = semua tenant `active`).
4. saas-api membuat 1 job `migrate` per tenant + outbox.
5. Worker per tenant: `POST logistics-api /internal/tenants/:id/migrate` → jika sukses, update `schema_version`, `success_count + 1`; jika gagal, catat error, `failed_count + 1` (**tidak** drop DB, migrasi yang gagal otomatis batal karena transaksi).
6. Hapus cache tenant.
7. Pantau `GET /api/v1/migrations/rollouts/:id`.

> Versi migrasi terbaru dibaca dari `GET logistics-api /internal/migrations/status`.

### 4.6 Suspend / Activate

`PATCH /clients/:id/status` → update DB, audit log, `DEL` cache Redis, publish channel `tenant-invalidate` → logistics-api menutup pool tenant tersebut.

### 4.7 Deprovision

Job `deprovision`: status `deprovisioning` → backup `pg_dump -Fc` (opsional) → revoke connect & terminate koneksi → drop DB → drop roles → `clients.status='deleted'`, `dropped_at`, `tenant_count - 1`, invalidasi cache.

### 4.8 Rotasi Password DB

Job `rotate_password`: generate password baru → `ALTER ROLE` → simpan terenkripsi → invalidasi cache → logistics-api membuat pool baru.

---

## 5. Skema Database `saas_core`

> **Standar kolom (berlaku untuk SEMUA tabel):** `created_at`, `created_by`, `updated_at`, `updated_by`, `is_deleted BOOLEAN NOT NULL DEFAULT false`, `deleted_at`, `deleted_by`.
> Kolom `*_by` = UUID `admin_users.id` (`NULL` = sistem/worker). Hapus selalu soft delete; unique index dibuat parsial `WHERE is_deleted = false`.
> SQL di bawah adalah rancangan awal — sumber kebenaran skema ada di `src/database/migrations/` (sudah memakai kolom standar).

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== Admin MSI =====
CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(150) NOT NULL UNIQUE,
  name            VARCHAR(150) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(30)  NOT NULL DEFAULT 'operator', -- superadmin | operator | viewer
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash      VARCHAR(255) NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Plan & Subscription =====
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  max_users       INT,
  max_shipments_per_month INT,
  features        JSONB NOT NULL DEFAULT '{}',
  price_monthly   NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Cluster DB =====
CREATE TABLE db_clusters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL UNIQUE,
  host            VARCHAR(255) NOT NULL,
  port            INT NOT NULL DEFAULT 5432,
  pooler_host     VARCHAR(255),
  pooler_port     INT,
  admin_secret_ref VARCHAR(255) NOT NULL,   -- prefix env role provisioner, mis. CLUSTER_PG_PROD_01
  max_tenants     INT NOT NULL DEFAULT 100,
  tenant_count    INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active | full | maintenance | disabled
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Client =====
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code     VARCHAR(30)  NOT NULL UNIQUE,
  name            VARCHAR(150) NOT NULL,
  legal_name      VARCHAR(200),
  email           VARCHAR(150),
  phone           VARCHAR(30),
  address         TEXT,
  npwp            VARCHAR(30),
  status          VARCHAR(30)  NOT NULL DEFAULT 'provisioning',
    -- provisioning | provisioning_failed | active | suspended | deprovisioning | deleted
  status_reason   TEXT,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID REFERENCES admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_clients_status ON clients(status);

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  plan_id         UUID NOT NULL REFERENCES plans(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'trial', -- trial | active | past_due | expired | cancelled
  start_date      DATE NOT NULL,
  end_date        DATE,
  trial_end_date  DATE,
  auto_renew      BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_subscriptions_current ON subscriptions(client_id)
  WHERE status IN ('trial','active','past_due');

-- ===== Config DB Tenant =====
CREATE TABLE tenant_db_configs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL UNIQUE REFERENCES clients(id),
  cluster_id               UUID NOT NULL REFERENCES db_clusters(id),
  db_name                  VARCHAR(63) NOT NULL UNIQUE,
  db_owner_username        VARCHAR(63) NOT NULL UNIQUE,   -- lg_x_owner (DDL, migrasi)
  db_owner_password_enc    TEXT NOT NULL,
  db_app_username          VARCHAR(63) NOT NULL UNIQUE,   -- lg_x_app (DML, request user)
  db_app_password_enc      TEXT NOT NULL,
  encryption_key_version   INT  NOT NULL DEFAULT 1,
  system_user_username     VARCHAR(100) NOT NULL DEFAULT 'msi.support',
  system_user_password_enc TEXT NOT NULL,
  schema_version           VARCHAR(100),
  pool_max                 INT NOT NULL DEFAULT 5,
  password_rotated_at      TIMESTAMPTZ,
  provisioned_at           TIMESTAMPTZ,
  dropped_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Provisioning =====
CREATE TABLE provisioning_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  type            VARCHAR(30) NOT NULL,   -- provision | migrate | cleanup | deprovision | rotate_password
  status          VARCHAR(20) NOT NULL DEFAULT 'queued',
    -- queued | running | success | failed | rolling_back | rolled_back | rollback_failed
  mode            VARCHAR(20) NOT NULL DEFAULT 'full', -- full | resume
  parent_job_id   UUID REFERENCES provisioning_jobs(id),
  rollout_id      UUID,
  params          JSONB NOT NULL DEFAULT '{}',
  attempt         INT NOT NULL DEFAULT 0,
  failed_step     VARCHAR(50),
  error_message   TEXT,
  error_detail    JSONB,
  requested_by    UUID REFERENCES admin_users(id),
  worker_id       VARCHAR(100),
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);
CREATE INDEX idx_prov_jobs_client ON provisioning_jobs(client_id);
CREATE INDEX idx_prov_jobs_status ON provisioning_jobs(status);
-- hanya satu job aktif per client
CREATE UNIQUE INDEX uq_prov_jobs_active ON provisioning_jobs(client_id)
  WHERE status IN ('queued','running','rolling_back');

CREATE TABLE provisioning_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES provisioning_jobs(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  step_name       VARCHAR(50) NOT NULL,
    -- create_roles | create_database | grant_privileges | run_migrations | run_seeders | verify | finalize
  executor        VARCHAR(20) NOT NULL,   -- saas-worker | logistics-api
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | running | success | failed | skipped | compensated | compensate_failed
  attempt         INT NOT NULL DEFAULT 0,
  message         TEXT,
  error_message   TEXT,
  error_detail    JSONB,
  http_status     INT,                    -- untuk step yg hit logistics-api
  response_body   JSONB,                  -- hasil migrasi/seeder (dipotong)
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  UNIQUE (job_id, step_name)
);

CREATE TABLE migration_rollouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_version  VARCHAR(100) NOT NULL,
  total_tenants   INT NOT NULL DEFAULT 0,
  success_count   INT NOT NULL DEFAULT 0,
  failed_count    INT NOT NULL DEFAULT 0,
  status          VARCHAR(30) NOT NULL DEFAULT 'running', -- running | completed | completed_with_errors
  requested_by    UUID REFERENCES admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

-- ===== Outbox =====
CREATE TABLE outbox_events (
  id              BIGSERIAL PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  routing_key     VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;

-- ===== Audit =====
CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  actor_type      VARCHAR(20) NOT NULL,   -- admin | system | worker | logistics-api
  actor_id        VARCHAR(100),
  action          VARCHAR(100) NOT NULL,
  target_type     VARCHAR(50),
  target_id       VARCHAR(100),
  before_data     JSONB,
  after_data      JSONB,
  ip_address      VARCHAR(45),
  request_id      VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
```

---

## 6. Endpoint

Base path: `/api/v1`. Semua butuh JWT admin MSI, kecuali login dan `/internal/*`.

```json
{ "success": true, "data": {}, "meta": { "request_id": "..." } }
{ "success": false, "error": { "code": "CLIENT_CODE_TAKEN", "message": "..." } }
```

### 6.1 Auth Admin MSI

| Method | Path | Fungsi |
|---|---|---|
| POST | `/auth/login` | Login admin MSI |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/me` | Profil admin |

### 6.2 Admin Users (superadmin)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/admin-users` | List admin MSI |
| POST | `/admin-users` | Tambah admin |
| PATCH | `/admin-users/:id` | Ubah data / role / nonaktifkan |
| POST | `/admin-users/:id/reset-password` | Reset password |

### 6.3 Plans

| Method | Path | Fungsi |
|---|---|---|
| GET | `/plans` | List plan |
| POST | `/plans` | Buat plan |
| PATCH | `/plans/:id` | Ubah plan / feature flags (→ invalidasi cache semua tenant di plan itu) |

### 6.4 DB Clusters

| Method | Path | Fungsi |
|---|---|---|
| GET | `/clusters` | List cluster + kapasitas |
| POST | `/clusters` | Daftarkan cluster |
| PATCH | `/clusters/:id` | Ubah host / kapasitas / status |
| POST | `/clusters/:id/test-connection` | Tes koneksi role provisioner |

### 6.5 Clients

| Method | Path | Fungsi |
|---|---|---|
| GET | `/clients` | List client (filter status, search, pagination) |
| POST | `/clients` | Buat client + config DB + job provisioning → `202` + `job_id` |
| GET | `/clients/:id` | Detail client + subscription + status DB (tanpa password) |
| PATCH | `/clients/:id` | Ubah profil client |
| PATCH | `/clients/:id/status` | Suspend / activate |
| POST | `/clients/:id/deprovision` | Offboarding |
| GET | `/clients/:id/db-config` | Lihat config DB (tanpa password) |
| POST | `/clients/:id/rotate-db-password` | Job rotasi password |
| POST | `/clients/:id/reveal-system-user` | (superadmin) Lihat password ghost user sekali, tercatat di audit |
| POST | `/clients/:id/reset-system-user` | Generate password ghost user baru → worker hit `logistics-api /internal/tenants/:id/system-user/reset` |
| GET | `/clients/:id/jobs` | Histori job |
| GET | `/clients/:id/audit-logs` | Histori aktivitas admin |

Contoh body `POST /clients`:

```json
{
  "client_code": "ogo",
  "name": "OGO Logistics",
  "legal_name": "PT Owngo Logistics Indonesia",
  "email": "admin@ogo.co.id",
  "phone": "0812xxxx",
  "plan_code": "pro",
  "subscription": { "status": "trial", "start_date": "2026-11-10", "trial_end_date": "2026-12-10" },
  "cluster_id": null,
  "settings": { "timezone": "Asia/Jakarta" }
}
```

### 6.6 Subscriptions

| Method | Path | Fungsi |
|---|---|---|
| GET | `/clients/:id/subscriptions` | Histori subscription |
| POST | `/clients/:id/subscriptions` | Buat / ganti subscription |
| PATCH | `/subscriptions/:id` | Ubah status / tanggal |

### 6.7 Provisioning Jobs

| Method | Path | Fungsi |
|---|---|---|
| GET | `/provisioning-jobs` | List job (filter status, type, client) |
| GET | `/provisioning-jobs/:id` | Detail job + semua step + error + respons logistics-api |
| POST | `/provisioning-jobs/:id/retry` | Retry job gagal |
| POST | `/provisioning-jobs/:id/cleanup-and-rerun` | Paksa cleanup lalu provisioning ulang |
| POST | `/provisioning-jobs/:id/cleanup` | Cleanup saja |

### 6.8 Migration Rollout

| Method | Path | Fungsi |
|---|---|---|
| GET | `/migrations/status` | Versi migrasi terbaru di logistics-api + jumlah tenant per `schema_version` |
| POST | `/migrations/rollout` | Rollout migrasi ke semua / sebagian tenant |
| GET | `/migrations/rollouts` | List rollout |
| GET | `/migrations/rollouts/:id` | Progress + tenant yang gagal |
| POST | `/migrations/rollouts/:id/retry-failed` | Ulangi tenant yang gagal |

### 6.9 Internal (untuk logistics-api, tidak diekspos di Kong publik)

Auth: header `X-Internal-Key` (nanti bisa mTLS).

| Method | Path | Fungsi |
|---|---|---|
| GET | `/internal/tenants/:client_code/resolve` | Config untuk request user normal. Hanya tenant `active`. Return **role app** saja |
| GET | `/internal/tenants/by-id/:client_id/resolve` | Sama, berdasarkan `client_id` |
| GET | `/internal/tenants/by-id/:client_id/resolve?scope=provisioning` | Untuk migrasi & seeder. Boleh status `provisioning`. Return **role owner** + password system user. Harus pakai `X-Internal-Key` khusus provisioning (`INTERNAL_PROVISIONING_KEY`) |

Response `scope=default`:

```json
{
  "client_id": "uuid", "client_code": "ogo", "name": "OGO Logistics",
  "status": "active",
  "subscription": { "status": "active", "plan_code": "pro", "end_date": "2027-11-10" },
  "features": { "tracking": true },
  "limits": { "max_users": 50 },
  "db": { "host": "10.0.0.10", "port": 6432, "database": "lg_ogo",
          "username": "lg_ogo_app", "password_enc": "base64...", "key_version": 1, "pool_max": 5 },
  "schema_version": "20261110_001"
}
```

Response `scope=provisioning` menambahkan:

```json
{
  "db_owner": { "host": "10.0.0.10", "port": 5432, "database": "lg_ogo",
                "username": "lg_ogo_owner", "password_enc": "base64..." },
  "system_user": { "username": "msi.support", "password_enc": "base64..." }
}
```

> Koneksi owner sebaiknya langsung ke Postgres (port 5432), bukan lewat PgBouncer mode transaction, karena migrasi memakai advisory lock & DDL.

### 6.10 Health

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/ready` | Cek Postgres, RabbitMQ, Redis |

Worker punya health server sendiri di `WORKER_HEALTH_PORT`.

---

## 7. Kontrak Panggilan ke logistics-api (dari saas-worker)

Semua request membawa header:
- `X-Internal-Key: <INTERNAL_PROVISIONING_KEY>`
- `X-Request-ID: <job_id>-<step>-<attempt>`
- `Idempotency-Key: <job_id>-<step>`

| Step | Request | Response sukses |
|---|---|---|
| `run_migrations` | `POST {LOGISTICS_API_INTERNAL_URL}/tenants/:client_id/migrate` `{ "target": "latest" }` | `200 { "schema_version": "20261110_001", "applied": ["20261101_init", "..."], "duration_ms": 3200 }` |
| `run_seeders` | `POST .../tenants/:client_id/seed` `{ "include_system_user": true }` | `200 { "seeded": ["01_permissions", "..."], "duration_ms": 900 }` |
| `verify` | `GET .../tenants/:client_id/verify` | `200 { "ok": true, "checks": { "app_role_login": true, "tables": true, "roles": 7, "system_user": true } }` |
| `reset_system_user` | `POST .../tenants/:client_id/system-user/reset` | `200 { "ok": true }` |

Error dari logistics-api:

```json
{ "success": false, "error": { "code": "MIGRATION_FAILED", "message": "...", "detail": { "migration": "20261110_add_trips", "pg_code": "42P07" } } }
```

Status `409 TENANT_LOCKED` (migrasi lain sedang berjalan) dianggap **transient**.

---

## 8. RabbitMQ

Exchange `tenant` (topic, durable), DLX `tenant.dlx`.

| Routing key | Queue | Prefetch | Payload |
|---|---|---|---|
| `tenant.provision.requested` | `provisioning.provision` | 1 | `{ job_id, client_id }` |
| `tenant.migrate.requested` | `provisioning.migrate` | 3 | `{ job_id, client_id, rollout_id, target }` |
| `tenant.cleanup.requested`, `tenant.deprovision.requested`, `tenant.rotate_password.requested`, `tenant.reset_system_user.requested` | `provisioning.maintenance` | 1 | `{ job_id, client_id }` |
| (dead letter) | `provisioning.dlq` | — | pesan rusak / job tidak ditemukan |

- Queue durable, pesan persistent, manual ack setelah status job tersimpan.
- Password **tidak pernah** masuk pesan.
- Graceful shutdown worker: berhenti consume, tunggu job berjalan selesai (maks `WORKER_SHUTDOWN_TIMEOUT_MS`).
- Recovery: saat worker start, job `running` milik `worker_id` yang sama yang terhenti > 15 menit ditandai `failed` dengan error `WORKER_INTERRUPTED`, lalu bisa di-retry.

---

## 9. Redis

| Key / Channel | Isi | TTL |
|---|---|---|
| `tenant:{client_code}`, `tenant:id:{client_id}` | Resolve tenant | 10 menit |
| channel `tenant-invalidate` | `{ client_id, client_code, reason }` | — |

Hapus key + publish channel setiap kali client, subscription, plan, password DB, atau `schema_version` berubah.

---

## 10. Keamanan

- Password admin: argon2/bcrypt. JWT access 15 menit, refresh 7 hari.
- Password role owner, role app, dan system user: AES-256-GCM, key `TENANT_DB_ENC_KEY` (sama di saas-api & logistics-api; nanti pindah ke Vault).
- Role provisioner cluster hanya ada di env `saas-worker`, tidak di proses API dan tidak di logistics-api.
- Dua internal key: `INTERNAL_API_KEY` (resolve biasa) dan `INTERNAL_PROVISIONING_KEY` (resolve scope provisioning & endpoint migrasi). Bocornya key biasa tidak memberi akses DDL.
- Semua aksi admin & worker tercatat di `audit_logs`.

---

## 11. Environment Variables

```
# umum
NODE_ENV=production
DATABASE_URL=postgres://saas_api:***@host:5432/saas_core
RABBITMQ_URL=amqp://user:***@rabbitmq:5672/logistics
REDIS_URL=redis://redis:6379/0
TENANT_DB_ENC_KEY=***
TENANT_DB_ENC_KEY_VERSION=1
INTERNAL_API_KEY=***
INTERNAL_PROVISIONING_KEY=***
LOG_LEVEL=info

# proses api
PORT=3000
JWT_ACCESS_SECRET=***
JWT_REFRESH_SECRET=***
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# proses worker
WORKER_ID=saas-worker-1
WORKER_HEALTH_PORT=3100
OUTBOX_POLL_INTERVAL_MS=1000
LOGISTICS_API_INTERNAL_URL=http://logistics-api:4000/internal
LOGISTICS_MIGRATE_TIMEOUT_MS=600000
LOGISTICS_SEED_TIMEOUT_MS=120000
ROLLBACK_ON_FAILURE=true
TRANSIENT_RETRY_MAX=3
WORKER_SHUTDOWN_TIMEOUT_MS=600000
BACKUP_DIR=/backups
CLUSTER_PG_PROD_01_USER=lg_provisioner
CLUSTER_PG_PROD_01_PASSWORD=***
```

---

## 12. Struktur Folder

```
logistics-saas-api/
├── src/
│   ├── api.js                     # entry proses API
│   ├── worker.js                  # entry proses worker
│   ├── app.js                     # express app
│   ├── config/
│   ├── db/
│   │   ├── migrations/            # migrasi saas_core (bukan DB tenant)
│   │   └── seeds/                 # admin awal, plan default
│   ├── modules/
│   │   ├── auth/
│   │   ├── admin-users/
│   │   ├── plans/
│   │   ├── clusters/
│   │   ├── clients/
│   │   ├── subscriptions/
│   │   ├── provisioning/          # endpoint job (list, detail, retry)
│   │   ├── migrations/            # endpoint rollout
│   │   └── internal/              # resolve tenant
│   ├── worker/
│   │   ├── outbox-relay.js
│   │   ├── consumers/
│   │   │   ├── provision.consumer.js
│   │   │   ├── migrate.consumer.js
│   │   │   └── maintenance.consumer.js
│   │   ├── jobs/
│   │   │   ├── provision.job.js   # urutan step + rollback
│   │   │   ├── migrate.job.js
│   │   │   ├── cleanup.job.js
│   │   │   ├── deprovision.job.js
│   │   │   └── rotate-password.job.js
│   │   ├── steps/
│   │   │   ├── create-roles.step.js
│   │   │   ├── create-database.step.js
│   │   │   ├── grant-privileges.step.js
│   │   │   ├── run-migrations.step.js   # HTTP → logistics-api
│   │   │   ├── run-seeders.step.js      # HTTP → logistics-api
│   │   │   ├── verify.step.js           # HTTP → logistics-api
│   │   │   └── finalize.step.js
│   │   └── health.js
│   ├── clients/
│   │   └── logistics-api.client.js # axios, timeout, retry transient
│   ├── lib/
│   │   ├── crypto.js
│   │   ├── cache.js
│   │   ├── pg-admin.js            # koneksi provisioner per cluster
│   │   ├── lock.js
│   │   ├── errors.js              # transient vs permanent
│   │   └── audit.js
│   └── middlewares/
├── tests/
├── Dockerfile
└── package.json                   # scripts: start:api, start:worker
```

Kontrak step:

```js
module.exports = {
  name: 'run_migrations',
  executor: 'logistics-api',
  async isDone(ctx) { /* opsional */ },
  async run(ctx) { return ctx.logisticsApi.migrate(ctx.clientId); },
  async compensate(ctx) { /* tidak ada; ikut drop database */ },
};
```

---

## 13. Poin yang Perlu Dikonfirmasi

- [ ] Worker dijalankan sebagai container terpisah dari API (disarankan), atau satu proses saja?
- [ ] Default `ROLLBACK_ON_FAILURE=true`; di server dev mau `false` supaya bisa debug?
- [ ] Dua role per tenant (owner untuk migrasi, app untuk request) — setuju?
- [ ] Akun owner pertama client dibuat otomatis saat seeder, atau manual lewat ghost user?
- [ ] Login: `client_code` di form, atau subdomain?
- [ ] Backup deprovision: folder server atau object storage?

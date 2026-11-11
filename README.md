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

---

## Cara kerja sistem

### Gambaran besar

Sistem ini adalah **control plane**: tempat admin MSI mengelola siapa saja client (tenant) yang memakai aplikasi logistik, paket apa yang mereka bayar, dan di server database mana data mereka disimpan. **Setiap client mendapat database PostgreSQL sendiri** (`lg_<client_code>`), yang dibuat otomatis oleh worker.

Aplikasi logistiknya sendiri ada di repo lain, yaitu **`logistics-api`**. Pembagian tugasnya:

| Repo | Tugas |
|---|---|
| `logistics-saas-api` (repo ini) | Data client, plan, subscription, cluster. Membuat/menghapus role & database tenant. Menyimpan kredensial DB tenant (terenkripsi). |
| `logistics-api` | Aplikasi yang dipakai user client. Memiliki file migrasi & seeder DB tenant. Bertanya ke repo ini "client X databasenya di mana?" lewat endpoint `/internal`. |

```
 Admin MSI ──► saas-api ──► saas_core (client, plan, cluster, job, outbox)
                                 │
                       saas-worker (outbox relay) ──► RabbitMQ ──► saas-worker (consumer)
                                                                        │
                ┌───────────────────────────────────────────────────────┤
                ▼                                                       ▼
   Postgres cluster: CREATE ROLE / DATABASE / GRANT        logistics-api: migrate / seed / verify
                                                                        │
                                                    resolve tenant ◄────┘ (GET /internal/...)

 User client ──► logistics-api ──► resolve tenant (Redis / saas-api) ──► DB tenant lg_<code>
```

Kenapa lewat job & RabbitMQ, tidak langsung? Membuat database dan menjalankan migrasi bisa memakan waktu beberapa menit. API langsung membalas `202 Accepted` + `job_id`, lalu pekerjaan berat dijalankan worker di belakang. Progresnya dipantau per step.

### Istilah

| Istilah | Arti |
|---|---|
| **Client / tenant** | Perusahaan pelanggan (mis. `ogo` = OGO Logistics). Punya DB sendiri `lg_ogo`. |
| **Plan** | Paket langganan (basic / pro / enterprise): limit user, limit shipment, feature flag, harga. |
| **Subscription** | Langganan client ke satu plan dalam rentang waktu (trial / active / past_due / expired / cancelled). |
| **Cluster** | Server PostgreSQL tempat DB tenant dibuat. Satu cluster menampung banyak tenant (sampai `max_tenants`). |
| **Role provisioner** | User Postgres di cluster yang punya hak `CREATEDB CREATEROLE`. Hanya dipakai worker untuk membuat/menghapus DB tenant. |
| **Role owner / app** | Dua user Postgres per tenant. `lg_<code>_owner` untuk migrasi (DDL), `lg_<code>_app` untuk request harian (CRUD saja). |
| **System user (ghost user)** | User admin tersembunyi di dalam aplikasi tenant untuk tim support MSI. Password-nya disimpan terenkripsi di sini. |
| **Job** | Satu pekerjaan worker (provision, migrate, cleanup, deprovision, rotate_password, reset_system_user), terdiri dari beberapa **step**. |
| **Outbox** | Tabel `outbox_events`. Event ditulis dalam transaksi yang sama dengan job, lalu worker mengirimnya ke RabbitMQ. Event tidak hilang walau RabbitMQ sedang mati. |
| **Rollout** | Menjalankan migrasi terbaru `logistics-api` ke banyak tenant sekaligus. |

### Alur dari awal sampai client aktif

Urutan yang harus dibuat pertama kali (contoh request lengkap ada di Swagger `/documentation`):

```
1. Siapkan role provisioner di server Postgres  ─┐
2. Pasang kredensialnya di env saas-worker       │  sekali
3. Login admin                                   │  (npm run seed sudah membuat admin,
4. (opsional) Tambah admin lain                  │   plan default & cluster default)
5. (opsional) Tambah / ubah plan                 │
6. (opsional) Daftarkan cluster tambahan         │
7. Tes koneksi cluster                          ─┘
8. Buat client  ──►  job provision  ──►  7 step worker  ──►  client active
9. Pantau job; jika gagal → perbaiki → retry
```

Dengan seed, langkah 5 dan 6 boleh dilewati: client bisa langsung dibuat hanya dengan `client_code` dan `name`.

**1. Siapkan role provisioner di server Postgres** (dijalankan DBA, sekali per cluster):

```sql
CREATE ROLE lg_provisioner LOGIN PASSWORD '***' CREATEDB CREATEROLE;
```

**2. Pasang kredensial di env `saas-worker`.** Nama prefix bebas, nanti dipakai sebagai `admin_secret_ref` cluster:

```env
CLUSTER_PG_PROD_01_USER=lg_provisioner
CLUSTER_PG_PROD_01_PASSWORD=***
# CLUSTER_PG_PROD_01_DATABASE=postgres
# CLUSTER_PG_PROD_01_SSL=false
```

Password provisioner **tidak pernah** disimpan di database atau di proses API, hanya di env worker.

**3. Login:** `POST /api/v1/auth/login` dengan admin hasil seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Pakai `access_token` sebagai `Authorization: Bearer ...`. Token berlaku 15 menit; perpanjang lewat `POST /auth/refresh`.

**4. (Opsional) Tambah admin:** `POST /api/v1/admin-users` dengan role `superadmin`, `operator`, atau `viewer`.

**5. Plan:** `npm run seed` membuat plan `default` (**plan default**: tanpa limit, semua fitur, harga 0) serta `basic`, `pro`, `enterprise`. Lihat dengan `POST /api/v1/plans/list`, tambah dengan `POST /api/v1/plans`. Plan default bisa dipindah dengan `PATCH /api/v1/plans/:id` `{ "is_default": true }`; default lama otomatis dilepas.

**6. Cluster:** `npm run seed` membuat **cluster default** dari env `SEED_CLUSTER_*`:

```env
SEED_CLUSTER_NAME=default
SEED_CLUSTER_HOST=localhost
SEED_CLUSTER_PORT=5432
SEED_CLUSTER_SECRET_REF=CLUSTER_DEFAULT   # worker membaca CLUSTER_DEFAULT_USER / _PASSWORD
SEED_CLUSTER_MAX_TENANTS=100
```

Cluster tambahan bisa didaftarkan dengan `POST /api/v1/clusters`:

```json
{ "name": "pg-prod-01", "host": "10.0.0.5", "port": 5432, "admin_secret_ref": "CLUSTER_PG_PROD_01", "max_tenants": 200 }
```

`admin_secret_ref` harus sama dengan prefix env di langkah 2. Cluster default bisa dipindah dengan `PATCH /api/v1/clusters/:id` `{ "is_default": true }`.

**7. Tes koneksi:** `POST /api/v1/clusters/:id/test-connection`. API meneruskan ke health server worker (`WORKER_INTERNAL_URL`), lalu worker mencoba login ke cluster memakai kredensial dari env. Jika gagal, periksa env worker dan akses jaringan sebelum lanjut.

**8. Buat client:** `POST /api/v1/clients`. Ada dua cara:

```json
// a. Pakai plan & cluster default → subscription active tanpa batas waktu
{ "client_code": "ogo", "name": "OGO Logistics" }

// b. Pilih plan & cluster sendiri untuk client tertentu
{
  "client_code": "ogo",
  "name": "OGO Logistics",
  "plan_code": "pro",
  "subscription": { "status": "trial", "start_date": "2026-11-10", "trial_end_date": "2026-12-10" },
  "cluster_id": "9f8e7d6c-5b4a-4321-8fed-cba987654321"
}
```

| Field | Jika kosong |
|---|---|
| `plan_code` | Plan default (`is_default`) |
| `cluster_id` | Cluster default; jika penuh / tidak `active` → cluster `active` dengan tenant paling sedikit |
| `subscription` | Plan default → `active`, tanpa `end_date` (berlaku tanpa batas waktu). Plan lain → `trial` |

Yang terjadi di saas-api, **dalam satu transaksi**:

1. Pilih plan dan cluster sesuai tabel di atas (cluster harus `active` dan `tenant_count < max_tenants`).
2. Insert `clients` (status `provisioning`) dan `subscriptions`.
3. Generate config DB: `lg_ogo`, role `lg_ogo_owner` & `lg_ogo_app` dengan password acak, plus password system user. Semua password dienkripsi AES-256-GCM, lalu disimpan di `tenant_db_configs`.
4. Insert `provisioning_jobs` (type `provision`, status `queued`) + 7 baris `provisioning_steps`.
5. Insert `outbox_events` (`tenant.provision.requested`).
6. `tenant_count + 1` di cluster; jika penuh → status cluster `full`.

Response: `202 Accepted` + `job_id`.

Lalu di saas-worker:

1. **Outbox relay** membaca `outbox_events` yang belum terkirim dan mem-publish ke RabbitMQ.
2. **Consumer** menerima `{ job_id }`, mengambil advisory lock per client (dua job untuk client yang sama tidak bisa jalan bersamaan), lalu menjalankan step berurutan:

| # | Step | Dijalankan oleh | Yang terjadi |
|---|---|---|---|
| 1 | `create_roles` | worker → cluster | Buat role `lg_ogo_owner` dan `lg_ogo_app` |
| 2 | `create_database` | worker → cluster | Buat DB `lg_ogo` dengan owner `lg_ogo_owner` |
| 3 | `grant_privileges` | worker → cluster | Tutup akses PUBLIC; role app hanya boleh SELECT/INSERT/UPDATE/DELETE |
| 4 | `run_migrations` | worker → `logistics-api` | `POST /internal/tenants/:id/migrate` → logistics-api membuat tabel |
| 5 | `run_seeders` | worker → `logistics-api` | `POST /internal/tenants/:id/seed` → data awal + system user |
| 6 | `verify` | worker → `logistics-api` | `GET /internal/tenants/:id/verify` → cek login role app, tabel, system user |
| 7 | `finalize` | worker | Client `active`, simpan `schema_version` & `provisioned_at`, hapus cache Redis |

**9. Pantau:** `GET /api/v1/provisioning-jobs/:id` menampilkan status setiap step, pesan error, dan respons `logistics-api`. Setelah job `success`, client berstatus `active` dan bisa langsung dipakai lewat `logistics-api`.

### Jika provisioning gagal

```
step N gagal
  ├─ error sementara (koneksi putus, 502/503/504, timeout)
  │     → ulangi step yang sama maks TRANSIENT_RETRY_MAX kali (backoff 2s, 5s, 15s)
  └─ error permanen (error migrasi, permission denied, 4xx)
        → job rolling_back → compensate mundur: drop database → drop roles
        ├─ semua berhasil → job rolled_back
        └─ ada yang gagal → job rollback_failed (perlu cleanup manual)
        → client provisioning_failed
```

Perbaiki penyebabnya (mis. bug migrasi di `logistics-api` lalu deploy ulang), lalu pilih:

| Endpoint | Kapan dipakai |
|---|---|
| `POST /provisioning-jobs/:id/retry` | Kasus normal. Membuat job baru (`parent_job_id` = job lama). |
| `POST /provisioning-jobs/:id/cleanup-and-rerun` | Job `rollback_failed`: paksa drop DB & role, lalu provisioning dari awal. |
| `POST /provisioning-jobs/:id/cleanup` | Hanya bersihkan DB & role, tanpa provisioning ulang. |

Untuk debug, set `ROLLBACK_ON_FAILURE=false`: DB dibiarkan apa adanya untuk diperiksa, dan retry melanjutkan dari step yang gagal.

Jika worker mati saat job berjalan, saat start berikutnya job tersebut ditandai `failed` dengan error `WORKER_INTERRUPTED` dan bisa di-retry.

### Setelah client aktif (operasional)

| Kebutuhan | Endpoint | Yang terjadi |
|---|---|---|
| Ubah profil client | `PATCH /clients/:id` | Update data + invalidasi cache |
| Suspend / aktifkan lagi | `PATCH /clients/:id/status` | `active` ⇄ `suspended`. Cache dihapus dan `logistics-api` diberi tahu lewat Redis pub/sub, sehingga user client langsung tertolak / bisa masuk lagi |
| Ganti paket | `POST /clients/:id/subscriptions` | Subscription lama di-cancel, yang baru berlaku |
| Ubah status langganan | `PATCH /subscriptions/:id` | Mis. `past_due`, `expired`, perpanjang `end_date` |
| Ubah fitur/limit plan | `PATCH /plans/:id` | Cache **semua** tenant di plan itu dihapus; fitur baru langsung terbaca |
| Rilis migrasi baru | `POST /migrations/rollout` | 1 job `migrate` per tenant aktif. Pantau di `GET /migrations/rollouts/:id`; ulangi yang gagal dengan `retry-failed`. Gagal migrasi **tidak** menghapus DB |
| Ganti password DB tenant | `POST /clients/:id/rotate-db-password` | Job `rotate_password`: `ALTER ROLE` + simpan password baru; `logistics-api` membuat pool baru |
| Reset password ghost user | `POST /clients/:id/reset-system-user` | Job `reset_system_user` → `logistics-api` mengganti password di DB tenant |
| Lihat password ghost user | `POST /clients/:id/reveal-system-user` | Hanya superadmin, tercatat di audit log |
| Berhenti berlangganan | `POST /clients/:id/deprovision` | Body `confirm_client_code` harus sama dengan kode client. Job `deprovision`: backup `pg_dump` (opsional) → putus koneksi → drop DB → drop roles → client `deleted`, `tenant_count - 1` |

### Siklus status

**Client:**

```
provisioning ──(job sukses)──► active ⇄ suspended
     │                            │         │
     └─(job gagal)─► provisioning_failed     │
                          │   └─(retry)──► provisioning
                          ▼                  ▼
                    deprovisioning ◄─────────┘
                          │
                          ▼
                       deleted
```

**Job:** `queued` → `running` → `success`. Jika gagal: `failed` (tanpa rollback) atau `rolling_back` → `rolled_back` / `rollback_failed`.

**Cluster:** `active` (menerima tenant baru) · `full` (otomatis saat `tenant_count` mencapai `max_tenants`) · `maintenance` / `disabled` (diset admin, tidak menerima tenant baru).

### Bagaimana `logistics-api` memakai sistem ini

Setiap request user client ke `logistics-api` perlu tahu DB tenant-nya:

1. Cek Redis `tenant:{client_code}` (TTL `TENANT_CACHE_TTL_SECONDS`).
2. Jika tidak ada → `GET /internal/tenants/:client_code/resolve` (header `X-Internal-Key: INTERNAL_API_KEY`). Responsnya berisi host, nama DB, role app + password terenkripsi, plan, fitur, dan status subscription. Hanya client `active` yang dilayani.
3. `logistics-api` mendekripsi password dengan `TENANT_DB_ENC_KEY` yang sama, lalu membuka pool ke DB tenant.
4. Saat data client berubah, repo ini menghapus cache dan publish ke channel `tenant-invalidate`, sehingga `logistics-api` menutup pool lama.

Saat provisioning, `logistics-api` memanggil `.../by-id/:client_id/resolve?scope=provisioning` (key `INTERNAL_PROVISIONING_KEY`) untuk mendapat role **owner**, yang dibutuhkan untuk migrasi.

---

## Kegunaan setiap modul

Semua modul ada di `src/modules/`. Endpoint di bawah relatif terhadap `/api/v1`. Endpoint yang mengambil list memakai `POST` dengan filter & pagination di body.

### `auth` — login admin MSI

Login, refresh token, logout, dan profil admin yang sedang login. Access token JWT 15 menit, refresh token 7 hari (disimpan di `admin_refresh_tokens` dan bisa di-revoke).

`POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`

### `admin-users` — akun tim MSI (superadmin saja)

Mengelola siapa saja yang boleh masuk panel admin dan apa role-nya (`superadmin` / `operator` / `viewer`). Bukan user client; user client dikelola `logistics-api`.

`POST /admin-users/list` · `POST /admin-users` · `GET /admin-users/:id` · `PATCH /admin-users/:id` · `POST /admin-users/:id/reset-password` · `DELETE /admin-users/:id`

### `plans` — paket langganan

Mendefinisikan paket yang dijual: `max_users`, `max_shipments_per_month`, `features` (feature flag JSON, mis. `{ "tracking": true, "reports": false }`), dan `price_monthly`. Satu plan ditandai `is_default`; plan ini dipakai client yang dibuat tanpa `plan_code`. `logistics-api` membaca limit & fitur ini dari hasil resolve untuk membatasi akses client. Plan yang masih dipakai subscription aktif tidak bisa dihapus.

`POST /plans/list` · `POST /plans` · `GET /plans/:id` · `PATCH /plans/:id` · `DELETE /plans/:id`

### `clusters` — server PostgreSQL tempat DB tenant

Daftar server Postgres yang bisa dipakai untuk tenant baru. Fungsinya:

- **Penempatan tenant:** saat client dibuat tanpa `cluster_id`, dipakai cluster default (`is_default`, dari seed). Jika penuh / tidak aktif, sistem memilih cluster `active` dengan tenant paling sedikit.
- **Kapasitas:** `tenant_count` vs `max_tenants`. Cluster otomatis jadi `full` saat penuh.
- **Pemisahan rahasia:** cluster hanya menyimpan `admin_secret_ref` (nama prefix env), bukan password. Password provisioner ada di env worker.
- **Koneksi aplikasi:** `pooler_host` / `pooler_port` (mis. PgBouncer) dipakai `logistics-api` jika diisi; `host` / `port` untuk provisioning.
- **Maintenance:** set status `maintenance` / `disabled` untuk berhenti menerima tenant baru. Cluster yang masih punya tenant tidak bisa dihapus.

`POST /clusters/list` · `POST /clusters` · `GET /clusters/:id` · `PATCH /clusters/:id` · `DELETE /clusters/:id` · `POST /clusters/:id/test-connection` (superadmin untuk tulis)

### `clients` — tenant / pelanggan

Modul utama. Membuat client sekaligus menyiapkan DB-nya, lalu mengelola seluruh siklus hidupnya: profil, suspend/activate, config DB, rotasi password, ghost user, deprovision, serta histori job dan audit log per client.

`POST /clients/list` · `POST /clients` · `GET /clients/:id` · `PATCH /clients/:id` · `PATCH /clients/:id/status` · `POST /clients/:id/deprovision` · `GET /clients/:id/db-config` · `POST /clients/:id/rotate-db-password` · `POST /clients/:id/reveal-system-user` · `POST /clients/:id/reset-system-user` · `POST /clients/:id/jobs` · `POST /clients/:id/audit-logs`

### `subscriptions` — langganan client

Histori langganan per client. Satu client hanya punya satu subscription berjalan (`trial` / `active` / `past_due`); membuat yang baru otomatis meng-cancel yang lama. Status subscription ikut dikirim di hasil resolve, sehingga `logistics-api` bisa membatasi client yang menunggak atau expired.

`GET /clients/:id/subscriptions` · `POST /clients/:id/subscriptions` · `PATCH /subscriptions/:id`

### `provisioning` — job worker

Melihat dan menangani semua job worker (bukan hanya provision): status tiap step, error, respons `logistics-api`, serta aksi retry / cleanup untuk job yang gagal.

`POST /provisioning-jobs/list` · `GET /provisioning-jobs/:id` · `POST /provisioning-jobs/:id/retry` · `POST /provisioning-jobs/:id/cleanup-and-rerun` · `POST /provisioning-jobs/:id/cleanup`

### `migrations` — rollout migrasi ke semua tenant

Dipakai setelah `logistics-api` merilis migrasi baru. `status` menampilkan versi migrasi terbaru di `logistics-api` dan jumlah tenant per `schema_version`. `rollout` membuat job `migrate` untuk semua tenant aktif (atau `client_ids` tertentu), dengan progres `success_count` / `failed_count`.

`GET /migrations/status` · `POST /migrations/rollout` · `POST /migrations/rollouts` · `GET /migrations/rollouts/:id` · `POST /migrations/rollouts/:id/retry-failed`

### `internal` — endpoint untuk `logistics-api`

Tidak untuk admin dan tidak diekspos di gateway publik. Diproteksi header `X-Internal-Key`. Mengembalikan konfigurasi tenant (DB, plan, fitur, subscription). Lihat [Kontrak dengan logistics-api](#kontrak-dengan-logistics-api).

`GET /internal/tenants/:client_code/resolve` · `GET /internal/tenants/by-id/:client_id/resolve?scope=provisioning`

### `health`

`GET /health` (liveness) dan `GET /health/ready` (cek Postgres, RabbitMQ, Redis) untuk Docker / load balancer. Worker punya health server sendiri di `:3100/health`.

### Bagian worker (`src/worker/`)

| File | Kegunaan |
|---|---|
| `outbox-relay.js` | Polling `outbox_events` tiap `OUTBOX_POLL_INTERVAL_MS`, publish ke RabbitMQ dengan confirm, lalu tandai terkirim |
| `consumer.js` | Consume 3 queue: `provisioning.provision` (prefetch 1), `provisioning.migrate` (prefetch 3), `provisioning.maintenance` (prefetch 1). Advisory lock per client |
| `runner.js` | Menjalankan step berurutan, retry error transient, rollback mundur jika gagal |
| `jobs/index.js` | Kebijakan per tipe job: boleh rollback atau tidak, dan apa yang dilakukan saat gagal |
| `steps/` | Implementasi tiap step (SQL ke cluster atau HTTP ke `logistics-api`) |
| `recovery.js` | Saat start, menandai job yang terpotong sebagai `WORKER_INTERRUPTED` |
| `health.js` | `GET /health` + `POST /clusters/:id/test-connection` (dipanggil saas-api) |

Step per tipe job (didefinisikan di `src/lib/job-plans.js`):

| Job | Step |
|---|---|
| `provision` | (`cleanup_existing` jika cleanup-and-rerun) → `create_roles` → `create_database` → `grant_privileges` → `run_migrations` → `run_seeders` → `verify` → `finalize` |
| `migrate` | `run_migrations` → `finalize_migrate` |
| `cleanup` | `drop_database` → `drop_roles` → `finalize_cleanup` |
| `deprovision` | (`backup`) → `revoke_connect` → `drop_database` → `drop_roles` → `finalize_deprovision` |
| `rotate_password` | `rotate_password` → `finalize_rotate` |
| `reset_system_user` | `reset_system_user` |

### Tabel `saas_core`

| Tabel | Isi |
|---|---|
| `admin_users`, `admin_refresh_tokens` | Akun admin MSI dan refresh token |
| `plans` | Paket langganan (`is_default` = plan default) |
| `db_clusters` | Server Postgres + kapasitas (`is_default` = cluster default) |
| `clients` | Tenant dan statusnya |
| `subscriptions` | Histori langganan client |
| `tenant_db_configs` | Nama DB, role owner/app, password terenkripsi, `schema_version` |
| `provisioning_jobs`, `provisioning_steps` | Job worker dan status tiap step |
| `migration_rollouts` | Rollout migrasi + jumlah sukses/gagal |
| `outbox_events` | Event yang menunggu dikirim ke RabbitMQ |
| `audit_logs` | Semua aksi admin & worker |

---

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
npm run seed                # superadmin + plan default/basic/pro/enterprise + cluster default
npm run dev:api             # http://localhost:9061/documentation
npm run dev:worker          # terminal lain
```

Lalu ikuti [Alur dari awal sampai client aktif](#alur-dari-awal-sampai-client-aktif). Provisioning penuh juga butuh `logistics-api` berjalan di `LOGISTICS_API_INTERNAL_URL`.

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

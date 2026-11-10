# Manajemen Pembayaran UKT SEVIMA

Solusi full-stack untuk SEVIMA Test M2: integrasi pembayaran UKT melalui webhook (jalur Middle/Senior).
Administrator keuangan menerbitkan tagihan uang kuliah tunggal (UKT) per mahasiswa dan semester; payment gateway melaporkan pembayaran melalui
webhook yang ditandatangani HMAC-SHA256; mahasiswa melihat status tagihan dan riwayat transaksi mereka. Banyak institusi berbagi satu
database PostgreSQL dengan isolasi data yang ketat.

| Lapisan | Teknologi |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind 4, disajikan oleh Nginx (sekaligus reverse proxy `/api`) |
| Backend | Node 22, NestJS 11, REST, Prisma 6 (klien tanpa Rust + adapter `pg`) |
| Database | PostgreSQL 16 (tagihan, transaksi, audit, sesi, penghitung rate limit) |
| Infra | Docker, Docker Compose (profil dev + demo + test), image multi-stage, non-root, health check |
| Pengujian | Jest + Supertest pada PostgreSQL sungguhan, Vitest + Testing Library, Node test runner, Playwright |

```
Browser ──http──> Nginx :8080 ──/api──> NestJS :3000 ──> PostgreSQL :5432
  (SPA, statis)   (satu-satunya port publik)   (hanya jaringan internal)   (hanya jaringan internal, volume pgdata)
```

---

## 1. Memulai dengan cepat (hanya Docker; tidak perlu Node/PostgreSQL di komputer Anda)

Prasyarat: Docker Desktop (Compose v2).

```bash
cp .env.example .env          # Windows PowerShell: copy .env.example .env
docker compose up --build     # run pertama membangun image, migrasi, dan seed database
```
Buka http://localhost:8080 lalu masuk dengan salah satu akun demo di bawah.

| Aksi | Perintah |
|---|---|
| Hentikan (data tetap tersimpan) | `docker compose down` |
| Reset semuanya | `docker compose down -v`: opsi `-v` menghapus volume PostgreSQL, yaitu seluruh data yang tersimpan; `up` berikutnya akan migrasi dan seed ulang |
| Log | `docker compose logs -f backend` |
| Jalankan ulang migrasi + seed | `docker compose run --rm migrate` |
| Hanya migrasi | `docker compose exec backend node_modules/.bin/prisma migrate deploy` |
| Hanya seed (idempoten) | `docker compose exec backend node dist/prisma/seed.js` |
| Tampilkan secret HMAC (khusus demo) | `docker compose exec backend node dist/prisma/show-secrets.js` |

### Akun demo (kata sandi untuk semua akun: `demosevima`)
| Peran | Institusi | Email |
|---|---|---|
| Admin keuangan | UM001 Universitas Negeri Malang | `admin.keuangan@um.ac.id` |
| Admin keuangan | UB001 Universitas Brawijaya | `admin.keuangan@ub.ac.id` |
| Admin keuangan | UI001 Universitas Indonesia | `admin.keuangan@ui.ac.id` |
| Mahasiswa | UM001 | `nadia.putri@student.um.ac.id` (memiliki tagihan UNPAID + PAID) |
| Mahasiswa | UM001 | `farhan.akbar@student.um.ac.id` (PAID) |
| Mahasiswa | UB001 | `rizky.aditya@student.ub.ac.id` (UNPAID) |
| Mahasiswa | UI001 | `dimas.prasetyo@student.ui.ac.id` (PAID) |

UM001 dan UB001 sama-sama memiliki tagihan bernomor `UKT-2026-0001`: nomor tagihan bersifat unik per institusi, bukan secara global.
Halaman login memiliki tombol bantuan “Isi akun demo” ketika `VITE_SHOW_DEMO_ACCOUNTS=true` (diatur di `.env.example`).

### Skenario demo 5 menit
1. Masuk sebagai `admin.keuangan@um.ac.id` → Tagihan UKT → Buat Tagihan untuk Nadia (nomor unik, jumlah, tanggal). Status awal adalah *Belum Bayar*.
2. Simulator Gateway → kirim `payment.success` untuk nomor tagihan dan jumlah tersebut → “Event diproses”. Kirim event yang sama lagi (“Gunakan Ulang” ID event) → *Duplikat*, tidak ada yang berubah. Centang *Kirim dengan signature tidak valid* → *Signature tidak valid*. Jumlah yang salah → *Jumlah tidak sesuai*.
3. Pemantauan Webhook menampilkan setiap pengiriman beserta waktu gateway vs. waktu diterima, hasil signature, status HTTP, dan alasannya. Riwayat Transaksi menampilkan tepat satu transaksi.
4. Keluar, lalu masuk sebagai `nadia.putri@student.um.ac.id` → tagihan berstatus *Lunas* beserta transaksinya.
5. Masuk sebagai `admin.keuangan@ub.ac.id`: tidak ada data UM yang terlihat.

---

## 2. Pengembangan dengan hot reload
```bash
docker compose -f docker-compose.dev.yml up --build
```
Frontend (Vite HMR): http://localhost:8443 (mem-proxy `/api` ke backend) · API: http://localhost:3000/api/health ·
PostgreSQL: `127.0.0.1:5432` · Node inspector: `127.0.0.1:9229`. Direktori source di-bind-mount; backend restart otomatis saat ada perubahan.

## 3. Catatan produksi
`APP_ENV=production` membuat backend menolak untuk start kecuali: `MOCK_GATEWAY_ENABLED=false`, `COOKIE_SECURE=true` (layani melalui HTTPS), dan tidak ada secret placeholder `dev-only`/`change-me`. Atur `SEED_DEMO_DATA=false`. Buat nilai sungguhan dengan: `openssl rand -hex 32` (session secret, kata sandi DB) dan `openssl rand -base64 32` (`SECRETS_ENCRYPTION_KEY`). Terminasi TLS di depan Nginx. Stack demo (`APP_ENV=demo`) melayani HTTP biasa di localhost, sehingga cookie tidak bersifat `Secure` di sana.

### Variabel environment (lihat `.env.example`)
| Variabel | Fungsi |
|---|---|
| `POSTGRES_USER/PASSWORD/DB` | Kredensial database (dipakai container postgres dan `DATABASE_URL` yang dibentuk di Compose) |
| `APP_ENV` | `development` · `demo` · `production` (mengaktifkan guard di atas) |
| `SESSION_SECRET` | ≥ 32 karakter; menandatangani cookie sesi |
| `SECRETS_ENCRYPTION_KEY` | base64 dari 32 byte; mengenkripsi secret HMAC institusi saat disimpan (at rest) |
| `COOKIE_SECURE` | `true` di balik HTTPS |
| `MOCK_GATEWAY_ENABLED` | Mendaftarkan endpoint simulator dan menampilkan halaman UI-nya; harus false di produksi |
| `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS` | Batas idle bergulir (60) / batas absolut (12) |
| `SEED_DEMO_DATA`, `DEMO_PASSWORD` | Seeding data demo (dilewati di produksi kecuali secara eksplisit `true`) |
| `HMAC_SECRET_UM001/UB001/UI001` | Secret tetap opsional untuk institusi hasil seed; jika tidak diisi, nilainya acak. Kirim secret sungguhan ke gateway melalui jalur terpisah (out-of-band, mis. email); jangan pernah di-commit |
| `FRONTEND_PORT`, `VITE_SHOW_DEMO_ACCOUNTS` | Port yang dipublikasikan; tombol bantuan demo di halaman login |

---

## 4. API
Base path `/api`. Masukan/keluaran JSON. Error: `{ "statusCode", "message", "errors"?, "requestId" }`. Autentikasi: cookie HttpOnly `sid`;
operasi tulis memerlukan header `X-CSRF-Token` (nilai dari cookie `XSRF-TOKEN` yang dapat dibaca). Institusi selalu diambil dari sesi.
Daftar dikembalikan sebagai array biasa; `?limit` (default 200, maks 500) dan `?offset` didukung, dan `X-Total-Count` memuat total.

| Method & path | Akses | Catatan |
|---|---|---|
| `POST /auth/login` | publik | `{email,password}` → `{user,institution}`; dibatasi rate limit (429) |
| `GET /auth/me` | sesi | pemulihan sesi |
| `POST /auth/logout` | sesi | menghancurkan sesi di server |
| `POST /invoices` | admin | `{studentId, invoiceNumber, semester, amount, issuedAt, expiresAt}` → 201 tagihan UNPAID; 409 nomor duplikat atau tagihan aktif untuk mahasiswa+semester tersebut; 404 mahasiswa dari institusi lain; 422 tanggal/semester tidak valid; 400 jumlah tidak valid/field tidak dikenal |
| `GET /invoices?status=&q=` | admin | tagihan milik institusi |
| `GET /invoices/:id` | sesi | admin: institusi sendiri; mahasiswa: hanya tagihan sendiri; selain itu 404 |
| `GET /me/invoices`, `GET /me/transactions`, `GET /me/student` | mahasiswa | |
| `GET /transactions` | admin | riwayat transaksi institusi |
| `GET /students`, `GET /semesters`, `GET /institutions` | admin / sesi / sesi | dibatasi per tenant (institutions hanya mengembalikan institusi Anda sendiri) |
| `GET /webhooks/events?status=` | admin | audit log persisten milik institusi |
| `POST /webhooks/payment` | HMAC | endpoint gateway (lihat di bawah) |
| `POST /dev/webhooks/simulate` | admin, khusus dev/demo | mock gateway (lihat di bawah) |
| `GET /health`, `GET /ready`, `GET /config` | publik | liveness, readiness (DB), flag runtime |

### 4.1 Webhook: `POST /api/webhooks/payment`
Header: `Content-Type: application/json`, `X-Signature: sha256=<64 karakter hex>`.

```json
{
  "event_id": "evt_000001",
  "event_type": "payment.success",
  "institution_code": "UM001",
  "invoice_number": "UKT-2026-0001",
  "amount": 6500000,
  "occurred_at": "2026-11-08T10:30:00+07:00"
}
```
`event_type` ∈ `payment.success`, `payment.expired`. `event_id` (≤100 karakter) adalah idempotency key per institusi. `amount` adalah bilangan bulat
rupiah utuh yang positif. `occurred_at` berformat ISO-8601 dengan offset.

Prosedur penandatanganan. `signature = "sha256=" + hex( HMAC_SHA256( institution_secret, raw_request_body_bytes ) )`. Tandatangani byte persis yang Anda kirim.
```bash
SECRET='<institution secret>'
BODY='{"event_id":"evt_000001","event_type":"payment.success","institution_code":"UM001","invoice_number":"UKT-2026-0001","amount":6500000,"occurred_at":"2026-11-08T10:30:00+07:00"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
curl -i http://localhost:8080/api/webhooks/payment -H 'Content-Type: application/json' -H "X-Signature: $SIG" --data-binary "$BODY"
```
```js
// Node
const sig = 'sha256=' + require('crypto').createHmac('sha256', secret).update(body).digest('hex');
```
Dapatkan secret institusi hasil seed dengan `docker compose exec backend node dist/prisma/show-secrets.js` (hanya non-produksi).

Respons (`{ status, message, event_id?, invoice_number?, invoice_status? }`):

| HTTP | `status` | Arti | Lokasi audit |
|---|---|---|---|
| 200 | `PROCESSED` | terverifikasi dan diterapkan (`invoice_status` = `PAID`/`EXPIRED`), transaksi dicatat | audit tenant |
| 200 | `DUPLICATE` | `event_id` ini sudah diproses dengan isi yang identik; tidak ada yang berubah | audit tenant |
| 401 | `INVALID_SIGNATURE` | `X-Signature` tidak ada/salah format/tidak benar | audit tenant (`signatureValid=false`) |
| 400 | `INVALID_PAYLOAD` | signature benar tetapi field tidak valid (mis. `event_type` tidak didukung, jumlah/tanggal salah) | audit tenant |
| 400 | `INVALID_PAYLOAD` | body bukan JSON / tidak memiliki `institution_code` | tingkat platform (terbatas) |
| 404 | `UNKNOWN_INSTITUTION` | kode institusi tidak terdaftar | tingkat platform (terbatas) |
| 404 | `INVOICE_NOT_FOUND` | tidak ada nomor tagihan tersebut *di institusi itu* | audit tenant |
| 422 | `AMOUNT_MISMATCH` | jumlah success ≠ jumlah tagihan; tagihan tidak dibayar | audit tenant |
| 409 | `INVALID_STATE` | tagihan sudah selesai (event terlambat/jenis duplikat diabaikan) | audit tenant |
| 409 | `REQUIRES_REVIEW` | success untuk tagihan EXPIRED: tidak diterapkan, perlu rekonsiliasi manual | audit tenant |
| 409 | `EVENT_CONFLICT` | `event_id` dipakai ulang dengan isi berbeda | audit tenant |
| 413 / 429 | , | body > 64 KB / rate limit terlampaui | |

Urutan keputusan: parse body → tentukan institusi → verifikasi HMAC (raw bytes, constant-time) → validasi payload → *(satu transaksi DB)* kunci tagihan
→ pemeriksaan idempotency → state machine → tulis baris audit + tagihan + transaksi secara atomik. Semantik dan alasannya: `DECISIONS.md` #2–#4.

### 4.2 Mock payment gateway
Aktif hanya ketika `MOCK_GATEWAY_ENABLED=true` (default di stack demo). Ia menandatangani dengan secret sisi server yang asli dan mengirim ke endpoint webhook yang asli.
- UI: administrator → *Simulator Gateway*: pilih tipe event, nomor tagihan, jumlah, opsional *Kirim dengan signature tidak valid* atau gunakan ulang ID event terakhir (uji duplikat). Opsi *kode tidak terdaftar* mendemonstrasikan `UNKNOWN_INSTITUTION`.
- API: `POST /api/dev/webhooks/simulate` (sesi admin + CSRF) dengan `{"payload":{...seperti di atas...},"tamperSignature":false}` → `{sent, httpStatus, processingStatus, signature, message}`.
  Administrator hanya dapat melakukan simulasi untuk institusi miliknya sendiri (selain itu 403).
- Tanpa aplikasi: gunakan resep `curl` di 4.1 dengan secret dari `show-secrets.js`.

---

## 5. Pengujian
PostgreSQL sungguhan di mana-mana; tidak ada yang di-mock pada integration test backend. Secret pengujian adalah nilai sekali pakai.
```bash
docker compose --profile test run --rm tests            # backend: unit + integration + tenant + webhook + concurrency + alur e2e
docker compose --profile test run --rm frontend-tests   # frontend: logika + service + komponen
docker compose up -d --build --wait                     # E2E browser membutuhkan stack yang berjalan
docker compose --profile test run --rm e2e              # Playwright: login, refresh, buat tagihan, gateway, tampilan mahasiswa, isolasi tenant
docker compose --profile test down -v                   # bersihkan container pengujian
```
Peta cakupan: autentikasi & sesi (kedaluwarsa, masa berlaku absolut, fixation, CSRF, rate limit, pemeriksaan peran) · isolasi tenant untuk tagihan, mahasiswa, transaksi,
event webhook, serangan direct-ID, lintas-mahasiswa, secret milik institusi lain, composite FK di tingkat DB · tagihan (matriks validasi, keunikan per institusi) ·
webhook (signature valid/tidak valid/malformed, tampering, semantik raw-byte, institusi tidak dikenal, tagihan tidak ada, jumlah tidak sesuai, duplikat, success terlambat, expiry terlambat,
pemakaian ulang event-id, duplikat konkuren 20 arah, event yang bersaing, kelengkapan audit) · mock gateway · siklus hidup end-to-end (admin → gateway → PAID → mahasiswa).

## 6. Backup dan restore
```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > ukt-$(date +%F).dump       # backup
docker compose stop backend
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < ukt-2026-11-09.dump   # restore
docker compose start backend
```
Cadangkan `SECRETS_ENCRYPTION_KEY` secara terpisah: tanpa kunci ini, secret HMAC institusi yang terenkripsi di dalam dump tidak dapat didekripsi.

## 7. Jalur penskalaan (belum diimplementasikan, memang disengaja: saat ini satu instance backend)
API bersifat stateless: sesi, rate limit, idempotency, dan lock semuanya berada di PostgreSQL, sehingga Anda dapat menjalankan N replika backend di balik `upstream` Nginx (atau load balancer apa pun)
tanpa perubahan kode. Tambahkan read replica PostgreSQL hanya untuk dasbor dengan beban baca berat, dan Redis hanya jika beban sesi/rate limit yang terukur membenarkannya. Anggaran koneksi: `DB_POOL_MAX` per instance × jumlah instance harus tetap di bawah `max_connections` PostgreSQL (atau tambahkan PgBouncer).

## 8. Pemecahan masalah
| Gejala | Penyebab / solusi |
|---|---|
| `variable is not set: copy .env.example to .env` | Jalankan `cp .env.example .env` |
| Port 8080 sedang dipakai | Atur `FRONTEND_PORT` di `.env` |
| Backend restart terus: "SECRETS_ENCRYPTION_KEY must be 32 bytes" | Kunci harus berupa base64 dari tepat 32 byte (`openssl rand -base64 32`) |
| Backend menolak start di produksi | Guard di §3; baca baris log-nya |
| Login berhasil tetapi request berikutnya 401 | `COOKIE_SECURE=true` pada HTTP biasa (browser membuang cookie); gunakan `false` di lokal |
| Halaman Simulator tidak ada | `MOCK_GATEWAY_ENABLED=false` (memang disengaja di produksi) |
| Mengubah secret `.env` setelah run pertama dan tidak ada yang bisa didekripsi | `SECRETS_ENCRYPTION_KEY` yang baru tidak dapat membaca data lama; jalankan `docker compose down -v` untuk seed ulang |
| Tes pertama Playwright gagal pada semester | Mahasiswa hanya dapat ditagih sekali per semester; reset dengan `down -v` untuk dataset baru |

## 9. Asumsi dan keterbatasan (mohon dibaca)
- Diverifikasi dengan benar-benar dijalankan di lingkungan build: seluruh tes backend terhadap PostgreSQL 16 (121 lulus), seluruh tes frontend (36 lulus), build TypeScript kedua aplikasi, backend hasil kompilasi yang di-seed dan dijalankan dengan `curl`, serta konfigurasi Nginx asli di depan SPA hasil build dan API hasil kompilasi (penyajian statis, SPA fallback, security header, proxy `/api`, HMAC raw-body melalui proxy, 413, CSRF).
- TIDAK dijalankan di sana (tidak ada Docker daemon, tidak ada browser): Dockerfile, file `docker compose`, health check container, dan suite Playwright. Semuanya ditulis dengan hati-hati dan struktur YAML sudah diperiksa, tetapi Anda harus menjalankan sendiri `docker compose up --build` dan profil e2e. Perbaiki semua yang dilaporkan Docker sebelum wawancara.
- Migrasi SQL ditulis tangan (schema engine Prisma tidak dapat diunduh di lingkungan build) agar sesuai dengan `schema.prisma` dan diterapkan ke PostgreSQL sungguhan oleh tes. Di mesin dengan Docker, Anda dapat menjalankan `prisma migrate diff` untuk memastikan tidak ada drift. CHECK constraint bisnis dan partial unique index hanya ada di SQL.
- Satu mata uang IDR, rupiah utuh; tidak ada pembayaran parsial, refund, atau UI rekonsiliasi. Event `REQUIRES_REVIEW` terlihat tetapi tidak ada aksi “selesaikan”.
- Peran hanya `ADMIN` dan `STUDENT`; satu pengguna tepat milik satu institusi; tidak ada UI reset kata sandi atau manajemen pengguna; email bersifat unik secara global.
- Tagihan tidak pernah kedaluwarsa otomatis berdasarkan jam; status berubah hanya saat ada notifikasi gateway.
- Prosedur rotasi secret HMAC institusi bersifat manual.
- Daftar dibatasi di sisi server maksimal 500 baris per request, dan UI memuat halaman pertama tersebut lalu memfilternya di browser.
- Event keamanan tingkat platform tidak memiliki UI (kueri tabel `PlatformSecurityEvent`).
- Riwayat Git: tidak ada commit yang dibuatkan untuk Anda; lihat `docs/COMMIT_PLAN.md` untuk urutan commit yang granular dan bermakna yang dapat Anda ikuti. Secret tidak ada di repositori (`.env` diabaikan; `.env.example` berisi placeholder khusus dev).

## 10. Struktur repositori
```
backend/   src/{auth,invoices,transactions,students,semesters,institutions,webhooks,audit,health,common,config}  prisma/{schema.prisma,migrations,seed*.ts}  test/
frontend/  src/{pages,components,services,lib,test}  Dockerfile  nginx.conf
e2e/       spesifikasi Playwright    docker-compose.yml (demo + profil test)   docker-compose.dev.yml
README.md  CLAUDE.md  AI_NOTES.md  DECISIONS.md  docs/COMMIT_PLAN.md
```

# Proyek: Manajemen Pembayaran UKT SEVIMA (Test M2: pembayaran UKT via webhook)

## Deskripsi singkat
Aplikasi web multi-institusi untuk penagihan uang kuliah tunggal (UKT). Administrator keuangan menerbitkan tagihan per mahasiswa per semester; payment
gateway memberi tahu sistem melalui webhook yang ditandatangani HMAC; mahasiswa melihat status tagihan dan riwayat transaksi mereka.
Banyak kampus berbagi satu database PostgreSQL dan tidak boleh saling melihat data satu sama lain. Di luar cakupan: gateway sungguhan, halaman checkout mahasiswa.

## Stack dan cara menjalankan
- Frontend: React 19, TypeScript, Vite, Tailwind 4 (`frontend/`). Produksi: hasil build statis yang disajikan oleh Nginx, yang juga mem-proxy `/api`.
- Backend: Node 22, NestJS 11, Prisma 6 (klien tanpa Rust + adapter `pg`), PostgreSQL 16 (`backend/`).
- Semuanya berjalan di Docker. Jangan berasumsi Node atau PostgreSQL ada di host.
```bash
cp .env.example .env
docker compose up --build                      # stack demo  -> http://localhost:8080
docker compose -f docker-compose.dev.yml up --build   # hot reload -> http://localhost:8443
docker compose --profile test run --rm tests          # tes backend (PostgreSQL sungguhan)
docker compose --profile test run --rm frontend-tests # tes unit/komponen frontend
docker compose up -d --build --wait && docker compose --profile test run --rm e2e   # Playwright
```
Migrasi: `prisma migrate deploy` (dijalankan di service `migrate` sekali jalan). Seed: `node dist/prisma/seed.js` (idempoten).

## Arsitektur singkat
Modular monolith. `backend/src/`: `auth` (login/me/logout, Argon2id, sesi), `invoices`, `transactions`, `students`,
`semesters`, `institutions`, `webhooks` (endpoint pembayaran, signature, validasi payload, state machine murni `decision.ts`,
service pemrosesan, mock gateway), `audit` (event keamanan tingkat platform), `common` (guard, Prisma, secret box, rate limiter,
logger, error filter), `config/env.ts` (konfigurasi tervalidasi). Guard global berjalan berurutan: `AuthGuard` -> `RolesGuard` -> `CsrfGuard`;
setiap route memerlukan autentikasi kecuali ditandai `@Public()`.
Model data (`backend/prisma/schema.prisma`): Institution, Student, User, Semester, Invoice, WebhookEvent, Transaction,
PlatformSecurityEvent, Session, RateLimit. Tabel anak merujuk ke induknya melalui composite FK `(id, institutionId)`.
Alasan di balik setiap pilihan besar: `DECISIONS.md`.

## Aturan bisnis penting (termasuk multi-institusi)
1. Tenant isolation. Setiap pengguna terautentikasi milik satu institusi. `institutionId` SELALU berasal dari sesi di sisi server
   (`@Auth()` -> `AuthContext`), tidak pernah dari body, query, header, atau URL. DTO tidak boleh memuat `institutionId`.
2. Admin hanya melihat institusinya sendiri. Mahasiswa hanya melihat baris dengan `studentId == auth.studentId`. Akses lintas-tenant/lintas-mahasiswa
   mengembalikan 404 (bukan 403) agar keberadaan data tidak terungkap.
3. Nomor tagihan bersifat unik per institusi (`UNIQUE(institutionId, invoiceNumber)`); nomor yang sama boleh ada di dua institusi.
4. Setiap institusi memiliki secret HMAC sendiri (dienkripsi AES-256-GCM saat disimpan). Webhook: `X-Signature: sha256=<hex>` = HMAC-SHA256 dari raw body bytes.
5. Status `UNPAID | PAID | EXPIRED`; hanya tagihan UNPAID yang dapat berubah. `payment.success` harus sama persis dengan jumlah tagihan.
   Success yang terlambat pada tagihan EXPIRED TIDAK diterapkan (`REQUIRES_REVIEW`); expiry yang terlambat tidak pernah menimpa PAID. Lihat `DECISIONS.md` #4.
6. Idempotency key = `(institutionId, event_id)`, ditegakkan oleh unique constraint ditambah row lock pada tagihan. Duplikat tidak pernah membuat transaksi kedua.
7. Setiap webhook yang diterima diaudit: `WebhookEvent` berlingkup tenant ketika institusi dikenal, `PlatformSecurityEvent` (terbatas) ketika tidak dikenal.
8. Jumlah berupa rupiah utuh (BIGINT di DB, number di JSON, 1..1e12). Tanggal: tanggal UKT berformat `YYYY-MM-DD` (hari kalender Asia/Jakarta).

## Konvensi kode
- TypeScript strict. Aturan bisnis berada di fungsi murni yang kecil (`decision.ts`, `payload.ts`, `signature.ts`) beserta unit test; I/O berada di service.
- Controller tipis: validasi (DTO class-validator), ambil `@Auth()`, delegasikan. Service menerima `AuthContext` sebagai parameter pertama.
- Error: lempar `HttpException` Nest; filter global mengembalikan `{ statusCode, message, errors?, requestId }`. Jangan pernah membocorkan detail internal.
- Logging: `logger.event(level, name, fields)` (JSON terstruktur). Selalu sertakan `requestId`; log webhook menyertakan `eventId`.
- Utamakan commit yang kecil dan bermakna (`feat(webhooks): ...`, `test(tenancy): ...`). Jangan pernah commit `.env` atau secret apa pun.
- Frontend: berkomunikasi dengan backend hanya melalui `src/services/*`; tidak ada mode mock. Pertahankan state UI: loading, kosong, error, sukses.
- Tabel baru memerlukan `institutionId` + composite FK ke induknya + index yang diawali `institutionId`.
- Perubahan skema: tambahkan migrasi SQL baru di `backend/prisma/migrations/`; jaga `schema.prisma` tetap sinkron; CHECK constraint bisnis dan partial unique index hanya ada di SQL.

## Hal yang tidak boleh dilakukan AI
- JANGAN menerima `institutionId`/`institution_id` dari request apa pun, dan JANGAN menulis query pada data tenant tanpa filter institusi yang diambil dari `AuthContext`.
- JANGAN memverifikasi signature webhook terhadap JSON yang diserialisasi ulang, membandingkan signature dengan `===`, atau mencatat/mengembalikan/menyimpan secret, kata sandi, session id, atau secret HMAC.
- JANGAN mengganti desain idempotency dengan check-then-insert, atau memindahkan penulisan audit/transaksi ke luar transaksi DB.
- JANGAN menerapkan otomatis event success pada tagihan EXPIRED atau membiarkan event apa pun menimpa PAID.
- JANGAN menaruh token/kata sandi di `localStorage`/`sessionStorage`, atau menambahkan route tanpa autentikasi kecuali diautentikasi HMAC (webhook) atau config/health publik.
- JANGAN mengaktifkan mock gateway di produksi, menambahkan `@Public()`/`@SkipCsrf()` sembarangan, atau melemahkan guard produksi di `config/env.ts`.
- JANGAN mengedit migrasi yang sudah diterapkan; tambahkan yang baru. JANGAN menghapus atau melewati tes yang gagal demi membuat build hijau; perbaiki penyebabnya.
- JANGAN mengklaim tes lulus tanpa menjalankannya (`docker compose --profile test run --rm tests`).
- JANGAN meng-hardcode URL; frontend menggunakan `/api` same-origin.

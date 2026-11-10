# Catatan Kolaborasi dengan AI dan Alur Kerja — SEVIMA-UKT-FULLSTACK

>Berkas ini menguraikan alur kerja kolaboratif yang dijalankan bersama asisten AI selama pembangunan, penguatan (hardening), dan pengujian proyek `SEVIMA-UKT-FULLSTACK`.

## 1. Bagian yang dikerjakan bersama AI (Alur Kerja dengan Bantuan AI)
- Arsitektur & Desain Sistem: Merancang arsitektur multi-tenancy multi-institusi (skema bersama dengan composite foreign key dan pembatasan tenant yang ketat) serta aturan state machine untuk event webhook dunia nyata yang tidak sempurna.
- Infrastruktur Backend (NestJS & PostgreSQL): Membangun struktur modular backend NestJS secara lengkap (`auth`, `invoices`, `transactions`, `webhooks`, `audit`, `common`), sesi Argon2id, verifikasi signature HMAC-SHA256 constant-time terhadap raw request bytes, serta idempotency transaksional menggunakan row lock (`SELECT … FOR UPDATE`).
- Perluasan Suite Pengujian: Menulis tes unit, integrasi, konkurensi (tes pengiriman duplikat paralel 20 arah), dan spesifikasi Playwright end-to-end yang memverifikasi isolasi tenant dan siklus hidup pembayaran.
- Pengaturan Docker & Deployment: Menyusun Dockerfile multi-stage, konfigurasi service Docker Compose untuk profil dev/demo/test, dan routing reverse proxy Nginx.

### Optimasi Konteks (`project_map.txt`)
Untuk menjaga efisiensi konteks yang tinggi dan mencegah pembengkakan token antar sesi:
- Skrip pemetaan proyek kustom (`mapcode`) digunakan untuk menghasilkan `project_map.txt`, yang menyediakan struktur pohon ringkas dan kerangka ekspor berkas.
- Dengan memberikan peta ini sebagai referensi dasar, asisten AI dapat langsung memahami tata letak repositori dan definisi tipe tanpa berulang kali mem-parse seluruh source mentah, sehingga batas konteks tetap tersedia untuk penalaran kode yang kompleks.
- `project_map.txt` hanya disimpan secara lokal dan dikecualikan melalui `.gitignore`.

## 2. Satu contoh saran AI yang saya tolak/koreksi, dan alasannya
1. *Perilaku mock webhook pada frontend awal.* Implementasi mockup awal menangani event webhook di browser dan mengembalikan respons palsu tanpa menulis baris audit atau menghormati batas tenancy yang sesungguhnya. Ini ditolak karena melanggar persyaratan brief (“seluruh notifikasi dicatat” dan isolasi tenant yang ketat). Dikoreksi: event dari institusi tidak dikenal diarahkan ke log keamanan tingkat platform yang terbatas, dan setiap penolakan bisnis diaudit secara eksplisit dengan kode status yang presisi (`AMOUNT_MISMATCH`, `INVALID_STATE`, `REQUIRES_REVIEW`, dll.).
2. *Penanganan konkurensi.* Implementasi naif awal mengusulkan pemeriksaan “check-then-insert” standar untuk idempotency. Ini dikoreksi dan diganti dengan row lock (`SELECT … FOR UPDATE`) yang dikombinasikan dengan unique constraint database di dalam transaksi atomik, didukung mutation testing untuk memastikan race condition benar-benar tertangkap.

## 3. Bagian yang saya kerjakan tanpa AI, dan alasannya
- Cakupan Produk & Rekayasa Kebutuhan: Menentukan edge case mana yang paling penting bagi sistem pembayaran kampus di dunia nyata (mis. menangani event success yang terlambat pada tagihan kedaluwarsa melalui `REQUIRES_REVIEW`, bukan membayarkannya otomatis atau membuangnya diam-diam).
- Review, Verifikasi & Eksekusi: Meninjau setiap baris kode, memverifikasi hasil tes, menyelesaikan kendala lingkungan, dan mengorkestrasi eksekusi suite pengujian berbasis container pada tes integrasi backend dan alur Playwright.
- Persiapan Demo & Wawancara: Menyusun skrip demonstrasi, memverifikasi batasan keamanan (`APP_ENV=production`), dan menyiapkan penjelasan arsitektur untuk review.

## 4. Kalau mengulang dari awal, apa yang akan saya ubah
- Membuat migrasi database dengan `prisma migrate dev` langsung di lingkungan Docker native, bukan menulis berkas migrasi SQL secara manual.
- Menjalankan dan memvalidasi container Docker serta suite E2E Playwright secara berkelanjutan sepanjang pengembangan, bukan hanya mengandalkan eksekusi tes berbasis container pada tahap integrasi akhir.
- Menyusun commit git secara bertahap sejak scaffolding awal, bukan menumpuk riwayat implementasi dalam satu batch.
- Mengimplementasikan alur administratif “tandai lunas setelah review” untuk event webhook `REQUIRES_REVIEW`.

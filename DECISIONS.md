# Keputusan teknis

Lima keputusan yang membentuk sistem ini. Perilaku pembayaran di dunia nyata (event terlambat, duplikat, tidak berurutan, dan parsial) ditangani
pada keputusan 3 dan 4, sebagaimana diminta oleh brief penilaian. Keputusan pada fase frontend disimpan di
[`frontend/docs/frontend-phase-decisions.md`](frontend/docs/frontend-phase-decisions.md).

---

## 1. Isolasi multi-tenant: skema bersama, ditegakkan pada tiga lapisan

Konteks: Banyak institusi berbagi satu database PostgreSQL. Satu saja `WHERE institution_id = ...` yang terlewat di mana pun
akan membocorkan tagihan satu kampus ke kampus lain. Identitas tenant tidak boleh berasal dari sesuatu yang dikendalikan klien.

Opsi:
1. Database (atau skema) per institusi: isolasi paling kuat, tetapi bertentangan dengan brief (“banyak kampus dalam satu database”), serta melipatgandakan migrasi dan koneksi.
2. Skema bersama + PostgreSQL Row-Level Security (RLS) yang digerakkan oleh `SET app.institution_id`: kuat, tetapi `SET` pada koneksi yang di-pool mudah salah (setting yang bocor = pembacaan lintas-tenant), dan pooling Prisma membuatnya rapuh kecuali setiap query dijalankan dalam transaksi dengan `SET LOCAL`.
3. Skema bersama + pembatasan di tingkat aplikasi saja: sederhana, tetapi filter yang terlupa menjadi kebocoran senyap.

Keputusan: Skema bersama, dengan isolasi yang ditegakkan pada tiga lapisan independen; tidak ada lapisan yang memercayai lapisan sebelumnya:
- Identitas: `institutionId` dibaca dari baris sesi di sisi server (`AuthGuard` membaca ulang pengguna pada setiap request). Tidak ada DTO yang memiliki field `institutionId`, dan `ValidationPipe` global berjalan dengan `forbidNonWhitelisted`, sehingga klien yang mengirimkannya mendapat 400, bukan penerimaan diam-diam.
- Query: setiap method service menerima `AuthContext` dan menaruh `institutionId` (dan, untuk mahasiswa, `studentId`) di dalam `where`. Objek milik tenant lain dijawab dengan 404, bukan 403, sehingga keberadaannya tidak terungkap.
- Database: setiap tabel tenant membawa `institutionId` dan tabel anak merujuk ke induknya melalui composite foreign key `(id, institutionId)`. Bahkan query yang bermasalah atau pernyataan SQL yang ditulis tangan tidak dapat mengaitkan tagihan institusi A dengan mahasiswa institusi B (diuji dengan menyisipkan baris semacam itu secara langsung). Nomor tagihan adalah `UNIQUE (institutionId, invoiceNumber)`.
- Lalu lintas webhook yang tidak dapat diatribusikan (institusi tidak dikenal, body tidak dapat di-parse) masuk ke tabel `PlatformSecurityEvent` terpisah yang tidak dibaca oleh endpoint tenant mana pun.
- `GET /institutions` hanya mengembalikan institusi milik pemanggil; tidak ada direktori lintas-tenant.

Konsekuensi: Isolasi bertahan dari filter yang terlupa (lapisan 3 memblokir referensi lintas-tenant), tetapi tidak dari filter yang terlupa pada operasi *baca*: composite FK melindungi penulisan dan referensi, bukan `SELECT`. Risiko residual itu ditutup oleh suite tes isolasi tenant (setiap endpoint list/get, untuk admin dan mahasiswa) dan oleh aturan code review di `CLAUDE.md`. RLS tetap menjadi opsi penguatan di masa depan jika lapisan koneksi diubah agar menjalankan `SET LOCAL` per transaksi; RLS sengaja tidak ditambahkan secara sembarangan.

---

## 2. Verifikasi HMAC: secret per institusi, raw bytes, constant-time, terenkripsi saat disimpan

Konteks: Gateway mengautentikasi setiap notifikasi dengan `X-Signature: sha256=<hex HMAC-SHA256>`. Setiap institusi memiliki secret sendiri. Notifikasi membawa `institution_code` *di dalam* body yang sedang diautentikasi.

Opsi:
1. Parse JSON, serialisasi ulang, lalu hash: rusak pada perbedaan whitespace/urutan key sekecil apa pun dan dapat dilewati melalui keanehan kanonikalisasi.
2. Hash raw bytes persis seperti yang diterima.
3. Simpan secret di kolom plaintext vs. enkripsi vs. KMS/Vault eksternal.

Keputusan:
- Verifikasi dilakukan terhadap raw request bytes yang persis sama. `express.raw()` dipasang pada `/api/webhooks/payment` *sebelum* JSON parser (aplikasi dibuat dengan `bodyParser: false`), dan controller menerima `Buffer`. Sebuah tes membuktikan bahwa menandatangani JSON ringkas tetapi mengirim JSON yang diformat rapi akan gagal, sedangkan menandatangani byte yang diformat rapi akan berhasil, dan tes manual melalui Nginx mempertahankan spasi yang janggal byte demi byte.
- Body di-parse hanya untuk membaca `institution_code`, yang menentukan secret milik siapa yang dipakai; tidak ada hal lain darinya yang ditindaklanjuti sampai signature terverifikasi. Ini adalah masalah ayam-dan-telur yang standar pada webhook multi-tenant dan aman karena memilih secret yang salah hanya akan gagal diverifikasi.
- Tata bahasa header yang ketat (`^sha256=[0-9a-fA-F]{64}$`), lalu `crypto.timingSafeEqual` pada digest dengan panjang sama.
- Secret dienkripsi AES-256-GCM saat disimpan dengan kunci dari environment, dengan id institusi sebagai AAD (ciphertext yang ditempelkan ke baris institusi lain gagal didekripsi). Secret tidak pernah dipilih oleh query API mana pun, tidak pernah dicatat di log (logger juga menyamarkan key yang menyerupai secret), dan tidak disimpan di baris audit. Raw body dan header MAC disimpan untuk audit; MAC bukan secret.
- Mock gateway menandatangani dengan secret sisi server yang asli dan memanggil endpoint asli melalui HTTP, sehingga demo menjalankan persis jalur produksi. Ia hanya ada ketika `MOCK_GATEWAY_ENABLED=true`; dengan `APP_ENV=production` proses menolak untuk start jika opsi itu aktif.

Konsekuensi: KMS eksternal akan lebih kuat (rotasi kunci, audit) tetapi tidak proporsional untuk kasus ini; merotasi `SECRETS_ENCRYPTION_KEY` saat ini memerlukan skrip enkripsi ulang (prefiks envelope `v1:` menyisakan ruang untuk `v2`). Tidak ada pemeriksaan replay-window pada `occurred_at` karena payload dalam brief tidak memiliki semantik timestamp yang ditandatangani dan percobaan ulang event lama itu sah; keamanan terhadap replay berasal dari idempotency (keputusan 3).

---

## 3. Idempotency dan konkurensi: row lock + unique constraint, audit dalam transaksi yang sama

Konteks: Gateway melakukan retry. Dua pengiriman identik dapat tiba pada milidetik yang sama, dan event yang berbeda untuk tagihan yang sama (success vs. expiry) dapat berebut. “Periksa apakah event ada, lalu insert” adalah race condition dengan sendirinya.

Opsi:
1. Check-then-insert di aplikasi: rentan race.
2. Hanya unique constraint (tangkap pelanggarannya): benar untuk duplikat, tetapi tidak mengurutkan event yang *berbeda* untuk tagihan yang sama (success dan expiry bisa sama-sama membaca `UNPAID`).
3. Advisory lock / isolasi `SERIALIZABLE` dengan retry.
4. `SELECT … FOR UPDATE` pada baris tagihan ditambah unique constraint sebagai pengaman cadangan.

Keputusan: Opsi 4, di dalam satu transaksi `READ COMMITTED`:
1. `SELECT … FOR UPDATE` pada `(institutionId, invoiceNumber)`: setiap pengiriman yang menargetkan sebuah tagihan diserialisasi pada baris itu, sehingga yang kedua *melihat hasil commit yang pertama*.
2. Cari `Transaction` yang sudah ada untuk `(institutionId, eventId)`: isi sama → `DUPLICATE` (HTTP 200, agar gateway berhenti mencoba ulang); isi berbeda → `EVENT_CONFLICT` (409).
3. Jalankan state machine murni (`decide()`), lalu tulis baris audit, pembaruan tagihan, dan transaksi secara atomik.
4. `UNIQUE (institutionId, eventId)` pada `Transaction` adalah pengaman cadangan untuk kasus yang tidak dapat dicakup lock (*event id yang sama* yang menuju dua tagihan *berbeda*, yang mengambil lock berbeda); pada `P2002` handler mencoba ulang sekali dan mengamati pemenangnya.

Setiap pengiriman, termasuk duplikat dan penolakan, menghasilkan tepat satu baris audit `WebhookEvent`; hanya yang `PROCESSED` yang menghasilkan `Transaction`.

Konsekuensi: Throughput per tagihan diserialisasi (tidak masalah: satu tagihan hanya menerima sedikit event sepanjang hidupnya); tagihan yang berbeda berjalan sepenuhnya paralel. Tes membuktikannya: 20 pengiriman identik serentak → 1 `PROCESSED`, 19 `DUPLICATE`, tepat 1 transaksi, 20 baris audit; success/expiry yang bersaing → tepat satu pemenang. Mutation check dilakukan: dengan `FOR UPDATE` dan unique index dihapus, ketiga tes konkurensi gagal, sehingga tes-tes itu benar-benar menjaga perilakunya. Karena lock dan constraint berada di PostgreSQL, jaminan ini berlaku di beberapa instance API.

---

## 4. Transisi status pembayaran dan event dunia nyata yang tidak sempurna

Konteks: Brief menyatakan bahwa status tagihan “harus mencerminkan kondisi pembayaran yang sebenarnya” dan memperingatkan bahwa sistem pembayaran nyata tidak ideal. Gateway mengirim event yang terlambat, duplikat, tidak berurutan, dan kadang salah.

Keputusan (state machine; hanya `UNPAID` yang dapat berubah):

| Saat ini | Event | Hasil |
|---|---|---|
| UNPAID | `payment.success`, jumlah == jumlah tagihan | → PAID (transaksi dicatat, `paidAt` = waktu gateway) |
| UNPAID | `payment.success`, jumlah ≠ jumlah tagihan | ditolak `AMOUNT_MISMATCH` (422); tidak pernah ditandai lunas |
| UNPAID | `payment.expired` | → EXPIRED |
| PAID | `payment.expired` (terlambat) | diabaikan `INVALID_STATE` (409); PAID tidak pernah ditimpa |
| PAID | `payment.success` lain (event id berbeda) | diabaikan `INVALID_STATE` (409); tidak ada transaksi kedua |
| EXPIRED | `payment.success` (pembayaran terlambat) | tidak diterapkan otomatis; ditandai `REQUIRES_REVIEW` (409) |
| EXPIRED | `payment.expired` | diabaikan `INVALID_STATE` (409) |

Keputusan lain dengan semangat yang sama:
- Success yang terlambat pada tagihan EXPIRED adalah kasus berbahaya: uang mungkin benar-benar sudah berpindah. Membayarkannya otomatis akan menghidupkan kembali tagihan yang mungkin sudah diterbitkan ulang oleh kampus; membuangnya diam-diam menyembunyikan pembayaran yang nyata. Maka ia *dicatat dan ditampilkan* sebagai `REQUIRES_REVIEW` agar keuangan melakukan rekonsiliasi, dan tidak ada hal lain yang berubah.
- Pembayaran parsial atau berlebih tidak didukung: jumlah harus sama persis (gateway membayar tagihan yang tetap).
- Tidak ada auto-expiry berdasarkan jam: status berubah hanya pada notifikasi gateway (“sesuai notifikasi”). UI menandai tagihan UNPAID yang telah melewati tanggalnya tetapi tidak pernah menulis ulang statusnya.
- Event success dengan timestamp setelah `expiresAt` ketika tagihan masih UNPAID diterima: gateway, bukan tanggal, adalah sumber kebenaran apakah uang sudah diterima.
- `occurred_at` (waktu gateway) dan `receivedAt` (waktu kita) disimpan terpisah; `paidAt` memakai waktu gateway.
- Jumlah pada `payment.expired` tidak ditegakkan (tidak ada yang dibayar); jumlah pada `payment.success` ditegakkan.
- Semantik HTTP: 200 untuk `PROCESSED` dan `DUPLICATE` (berhenti retry), 401 signature salah, 400 malformed, 404 institusi/tagihan tidak dikenal, 409/422 penolakan bisnis. Gateway boleh me-retry 4xx/5xx; setiap retry aman berkat keputusan 3.
- Seorang mahasiswa hanya boleh memiliki satu tagihan non-expired per semester (partial unique index); tagihan yang sudah expired dapat diterbitkan ulang.

Konsekuensi: Keuangan harus menindaklanjuti baris `REQUIRES_REVIEW` (terlihat dan dapat difilter di Pemantauan Webhook), dan tidak ada alur refund/rekonsiliasi otomatis (di luar cakupan menurut brief). Aksi manual “tandai lunas setelah review” akan menjadi fitur lanjutan yang wajar.

---

## 5. Autentikasi dan sesi: sesi server-side di PostgreSQL, cookie HttpOnly, token CSRF

Konteks: Dua peran, identitas tenant diturunkan dari login, SPA di browser, dan kebutuhan untuk dapat diskalakan ke beberapa instance API di kemudian hari.

Opsi: (a) JWT di `localStorage`; (b) JWT di cookie HttpOnly; (c) sesi server-side opak di cookie HttpOnly, disimpan di memori / Redis / PostgreSQL.

Keputusan: (c) dengan penyimpanan di PostgreSQL (`connect-pg-simple`):
- Token di `localStorage` dapat dibaca oleh XSS mana pun; cookie bersifat `HttpOnly`, `SameSite=Lax`, `Secure` di produksi, dan tidak ada apa pun tentang sesi di penyimpanan browser (sebuah tes frontend memastikan storage tetap kosong).
- Sesi server-side dapat dicabut seketika (logout menghancurkan barisnya; guard membaca ulang pengguna pada setiap request sehingga penghapusan pengguna atau perubahan peran langsung berlaku), sesuatu yang tidak dapat dilakukan JWT tanpa denylist.
- PostgreSQL sebagai penyimpanan menjaga instance API tetap stateless tanpa infrastruktur baru (tidak perlu Redis hanya untuk sesi). Ini menambah satu pencarian ber-index per request, dapat diterima pada skala ini.
- Hashing kata sandi Argon2id (parameter minimum OWASP); waktu login yang nyaris konstan (dummy hash untuk email tidak dikenal); pesan error identik untuk email tidak dikenal dan kata sandi salah.
- Session fixation: id sesi dibuat ulang saat login. Masa berlaku: idle timeout bergulir 60 menit ditambah batas absolut 12 jam yang ditegakkan di guard (keduanya diuji).
- CSRF: SameSite=Lax adalah lapis pertama; route yang mengubah state juga memerlukan header `X-CSRF-Token` yang sama dengan token acak per sesi (synchroniser token, perbandingan constant-time). Route webhook dikecualikan (diautentikasi dengan HMAC, bukan cookie).
- Brute force: percobaan login dibatasi per akun (8 / 15 menit) dan per IP (50 / 15 menit) dengan penghitung di PostgreSQL (satu UPSERT atomik), sehingga batasnya dibagi oleh semua instance dan tidak berlipat ganda sesuai jumlah replika. Endpoint webhook juga memiliki batas per IP.

Konsekuensi: Lockout per akun memungkinkan penyerang mengunci login korban untuk sementara (trade-off DoS, dimitigasi oleh jendela singkat 15 menit dan batas IP yang terpisah). Cookie memerlukan deployment same-origin, yang disediakan Nginx. Di balik TLS di produksi, `COOKIE_SECURE=true` wajib (aplikasi menolak start jika tidak).

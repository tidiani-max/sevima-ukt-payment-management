> **Catatan historis (fase frontend).** Ditulis sebelum backend ada. Referensi ke “mock mode”, `VITE_USE_MOCK`, dan `src/lib/webhookLogic.ts` sudah usang: aplikasi sekarang berkomunikasi dengan API sungguhan. Lihat `README.md` dan `DECISIONS.md` di root.

# Sistem Pembayaran UKT SEVIMA: Frontend

Frontend untuk **M2: integrasi pembayaran UKT melalui webhook**. React 19 + TypeScript + Vite 8 + Tailwind 4, tanpa pustaka UI.
Aplikasi ini berjalan sepenuhnya pada data mock di dalam browser sampai backend tersedia. **Tidak ada kode backend di repositori ini.**

## Memulai dengan cepat
```bash
cp .env.example .env
npm install        # atau pnpm install
npm run dev        # http://localhost:8443
npm run typecheck  # tsc --noEmit (strict, tanpa variabel/parameter yang tidak terpakai)
npm test           # runner bawaan Node; mencakup logika murni di src/lib
npm run build      # build produksi ke dist/
```
`VITE_USE_MOCK=false` mengalihkan setiap service di `src/services/` ke pemanggilan HTTP sungguhan terhadap `VITE_API_BASE_URL`
(default `http://localhost:8000/api`).

## Akun demo (hanya mock mode; kata sandi `demosevima`)
| Peran | Institusi | Email |
|---|---|---|
| Admin keuangan | UM001 | admin.keuangan@um.ac.id |
| Admin keuangan | UB001 | admin.keuangan@ub.ac.id |
| Admin keuangan | UI001 | admin.keuangan@ui.ac.id |
| Mahasiswa | UM001 | nadia.putri@student.um.ac.id |
| Mahasiswa | UB001 | rizky.aditya@student.ub.ac.id |

## Fitur
**Administrator keuangan**
- *Ringkasan*: jumlah terkumpul / belum terbayar dan jumlah tagihan, seluruhnya diturunkan dari data yang dimuat.
- *Tagihan UKT*: daftar berlingkup institusi, pencarian (nomor tagihan, mahasiswa, NIM), filter status, paginasi, ekspor CSV, drawer detail dengan mahasiswa dan riwayat transaksi, serta **Buat Tagihan** (mahasiswa, nomor, semester, jumlah, tanggal terbit dan kedaluwarsa, dengan validasi inline).
- *Mahasiswa*, *Riwayat Transaksi* (pencarian, filter status, paginasi, drawer detail).
- *Pemantauan Webhook*: setiap event yang diterima, termasuk yang ditolak. Menampilkan ID dan tipe event, kode institusi, nomor tagihan, jumlah, **`occurredAt` (waktu gateway) dan `receivedAt` (waktu aplikasi ini) berdampingan**, hasil verifikasi signature, status pemrosesan, status HTTP, dan alasan penolakan.
- *Simulator Gateway*: alat pengembangan, dilabeli dengan jelas bahwa ini bukan payment gateway.

**Mahasiswa**: dasbor (profil, tagihan saat ini, jumlah belum terbayar, kedaluwarsa), Tagihan Saya, Riwayat Transaksi. Sengaja tidak ada halaman checkout.

**Aturan status.** Status selalu ditampilkan sebagai warna, ikon, dan teks. Tagihan `UNPAID` yang telah melewati tanggal kedaluwarsanya ditandai (“Melewati tanggal kedaluwarsa N hari”) tetapi **tidak pernah diberi label ulang**; hanya event webhook yang memindahkan tagihan ke `PAID` atau `EXPIRED`.

## Simulator gateway
Mendukung `payment.success` dan `payment.expired`. Anda dapat memilih institusi (termasuk kode yang tidak terdaftar), memasukkan nomor tagihan dan jumlah, melihat pratinjau JSON body yang persis, membuat ID event baru atau **menggunakan ulang yang terakhir dikirim** untuk menguji duplikat, serta mencentang **“Kirim dengan signature tidak valid”**.

- **Mock mode:** handler kecil di dalam browser (`src/lib/webhookLogic.ts`) menjawab dengan keputusan yang diharapkan dibuat oleh backend, memperbarui tagihan, menambah transaksi, dan mencatat event, sehingga kelima status pemrosesan dapat didemonstrasikan. Tidak ada kriptografi. Data direset saat reload. Respons dilabeli “(disimulasikan)”.
- **Real mode:** request menuju `POST /dev/webhooks/simulate`; **backend** yang menandatangani dengan secret institusi. Browser tidak pernah menyimpan atau menghitung secret HMAC.

## Kontrak API frontend
Semua request memakai `credentials: "include"` (cookie sesi yang diterbitkan backend) dan `Content-Type: application/json`.
Tenant (institusi) **selalu diturunkan dari sesi di server**; tidak ada request yang membawa `institutionId`.
Body error berbentuk `{ "message": string }`. UI menampilkan `message` hanya untuk 400, 409, dan 422; status lain mendapat teks ramah yang tetap (`src/lib/errors.ts`).
Daftar saat ini dikembalikan utuh dan **difilter, dicari, dan dipaginasi di browser** (ukuran halaman 10), sehingga tidak ada query parameter yang dikirim saat ini. Backend dapat menambahkannya nanti tanpa merusak UI.

Kolom Auth: **Public** = tanpa sesi; **Session** = pengguna mana pun yang sudah masuk; **Admin** / **Student** = dibatasi per peran.

| Method & path | Auth | Request body | Respons sukses | Error |
|---|---|---|---|---|
| `POST /auth/login` | Public | `{ email, password }` | `200 Session` | 401 kredensial salah |
| `POST /auth/logout` | Session | tidak ada | `204`/`200`, body kosong diperbolehkan | tidak ditampilkan (sign-out lokal selalu berlanjut) |
| `GET /institutions` | Session | tidak ada | `200 Institution[]` | 401, 5xx |
| `GET /semesters` | Session | tidak ada | `200 Semester[]` | 401, 5xx |
| `GET /invoices` | Admin | tidak ada | `200 Invoice[]` untuk institusi admin | 401, 403, 5xx |
| `POST /invoices` | Admin | `CreateInvoiceInput` | `201`/`200 Invoice` (status `UNPAID`) | 400/422 validasi, 401, 403, **409 nomor tagihan duplikat** |
| `GET /me/invoices` | Student | tidak ada | `200 Invoice[]` (hanya milik sendiri) | 401, 403 |
| `GET /me/student` | Student | tidak ada | `200 Student` | 401, 404 |
| `GET /students` | Admin | tidak ada | `200 Student[]` untuk institusi admin | 401, 403 |
| `GET /transactions` | Admin | tidak ada | `200 Transaction[]` untuk institusi | 401, 403 |
| `GET /me/transactions` | Student | tidak ada | `200 Transaction[]` (hanya milik sendiri) | 401, 403 |
| `GET /webhooks/events` | Admin | tidak ada | `200 WebhookEvent[]` | 401, 403 |
| `POST /dev/webhooks/simulate` | Admin, **khusus dev** | `SimulationRequest` | `200 SimulationResult` | 401, 403, 404 saat dinonaktifkan |

Endpoint milik backend yang menjadi target simulator (tidak dipanggil oleh browser): `POST /api/webhooks/payment` dengan header `X-Signature` (HMAC-SHA256 dari raw body) dan body `WebhookPayload`.

### Tipe (`src/types.ts`, `src/services/webhook.service.ts`)
```ts
type PaymentStatus = "UNPAID" | "PAID" | "EXPIRED";
type ProcessingStatus = "PROCESSED" | "DUPLICATE" | "INVALID_SIGNATURE" | "INVOICE_NOT_FOUND" | "UNKNOWN_INSTITUTION";
type Session = { user: User; institution: Institution };
type Semester = { value: string; label: string; current?: boolean };   // value mis. "Ganjil 2026/2027"
type CreateInvoiceInput = { studentId; invoiceNumber; semester; amount /* bilangan bulat positif IDR */; issuedAt; expiresAt /* YYYY-MM-DD */ };
type WebhookPayload = { event_id; event_type: "payment.success" | "payment.expired"; institution_code; invoice_number; amount; occurred_at };
type SimulationRequest = { payload: WebhookPayload; tamperSignature: boolean };
type SimulationResult = { sent: boolean; simulated?: boolean; httpStatus?: number; processingStatus?: ProcessingStatus; signature?: string; message: string };
interface WebhookEvent {
  eventId; eventType; institutionCode; invoiceNumber; amount;
  occurredAt: string;   // kapan gateway membuat event (occurred_at pada payload)
  receivedAt: string;   // kapan aplikasi ini menerima request (diatur oleh backend)
  signature; signatureValid: boolean; processingStatus: ProcessingStatus; httpStatus: number; errorMessage?: string;
}
```
Tanggal tagihan berformat `YYYY-MM-DD`; timestamp berformat ISO-8601 dengan offset.

### Urutan keputusan webhook yang diasumsikan UI
1. Kode institusi tidak dikenal → `UNKNOWN_INSTITUTION` (404). 2. Signature salah → `INVALID_SIGNATURE` (401). 3. ID event sudah diproses → `DUPLICATE` (200).
4. Tagihan tidak ada untuk institusi tersebut → `INVOICE_NOT_FOUND` (404). 5. Selain itu terapkan dan kembalikan `PROCESSED` (200).

## Data mock
`src/mocks/data.ts`: 3 institusi, 5 pengguna, 6 mahasiswa, 7 tagihan (nomor tagihan sengaja berulang antar institusi), 5 transaksi, dan 9 event webhook yang mencakup kasus processed, duplicate, invalid-signature, tagihan tidak ada, dan institusi tidak dikenal, ditambah daftar semester. Tagihan yang dibuat atau diubah dalam sesi hanya hidup di memori.

## Asumsi dan keterbatasan
- **Login mock bukan autentikasi.** Pemfilteran sisi klien bukan isolasi tenant; backend harus menegakkannya.
- Event `UNKNOWN_INSTITUTION` tidak milik tenant mana pun; demo menampilkannya kepada setiap administrator. Backend harus memutuskan siapa yang boleh melihatnya.
- Dua hasil simulator tidak memiliki status pemrosesan dalam spesifikasi (event untuk tagihan yang sudah selesai → 409; jumlah success ≠ jumlah tagihan → 422). Demo melaporkannya tetapi tidak mencatatnya. **Pertanyaan terbuka untuk backend.**
- Value semester dikirim dan diterima tanpa perubahan; hanya label yang diterjemahkan untuk tampilan.
- Pengujian browser, Lighthouse, dan screen reader tidak dijalankan di lingkungan yang dipakai menyiapkan versi ini. Lihat laporan akhir.

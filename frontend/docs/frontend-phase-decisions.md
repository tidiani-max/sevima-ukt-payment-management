> **Catatan historis (fase frontend).** Ditulis sebelum backend ada. Referensi ke “mock mode”, `VITE_USE_MOCK`, dan `src/lib/webhookLogic.ts` sudah usang: aplikasi sekarang berkomunikasi dengan API sungguhan. Lihat `README.md` dan `DECISIONS.md` di root.

# Keputusan teknis

## 1. Pertahankan lapisan service dan ganti mock/real dengan satu flag
- **Konteks:** backend belum ada, tetapi halaman harus dibangun dan didemokan sekarang.
- **Alternatif:** mock server (MSW/json-server); data mock inline di komponen; build khusus mock yang terpisah.
- **Keputusan:** setiap pemanggilan melalui `src/services/*.service.ts`; `VITE_USE_MOCK` memilih data in-memory atau `fetch`. Tanpa dependensi tambahan.
- **Konsekuensi:** halaman tidak pernah tahu mode apa yang sedang berjalan, sehingga integrasi cukup dengan mengubah flag env dan memperbaiki bentuk respons. Perilaku mock harus dijaga tetap selaras dengan kontrak secara manual.

## 2. Identitas tenant berasal dari sesi, tidak pernah dari UI
- **Konteks:** tagihan, transaksi, dan log webhook bersifat spesifik per institusi.
- **Alternatif:** mengirim `institutionId` di setiap request; membiarkan pengguna memilih institusi.
- **Keputusan:** request tidak membawa `institutionId`; backend menurunkannya dari sesi. Pemfilteran sisi klien di mock mode hanya meniru hal ini.
- **Konsekuensi:** UI tidak dapat dipakai untuk membaca data tenant lain dengan mengedit request, tetapi isolasi yang sesungguhnya adalah tanggung jawab backend dan didokumentasikan demikian.

## 3. Pisahkan `occurredAt` dan `receivedAt` pada event webhook
- **Konteks:** waktu event di gateway dan waktu penerimaan di aplikasi berbeda (retry, latensi) dan penting untuk audit.
- **Alternatif:** menyimpan satu timestamp; hanya menampilkan waktu penerimaan.
- **Keputusan:** `WebhookEvent` membawa keduanya. Keduanya muncul di tabel monitor dan drawer detail, dengan label “Terjadi (gateway)” dan “Diterima (aplikasi)”. Daftar diurutkan berdasarkan `receivedAt`.
- **Konsekuensi:** backend harus menyimpan keduanya. Kode sebelumnya melabeli `occurredAt` sebagai “Diterima”, yang keliru dan sudah diperbaiki.

## 4. Handler webhook demo sebagai fungsi murni, tanpa kripto di frontend
- **Konteks:** brief mewajibkan simulasi kedua tipe event dan penampilan respons, namun melarang HMAC di browser atau secret yang terekspos.
- **Alternatif:** menghitung HMAC di browser dengan secret demo; menjadikan simulator sebagai pratinjau yang tidak berfungsi.
- **Keputusan:** `src/lib/webhookLogic.ts` menentukan hasil dari payload dan checkbox “signature tidak valid”, tanpa kriptografi. Pada real mode, backend yang menandatangani. Respons diberi label “(disimulasikan)”.
- **Konsekuensi:** kelima status pemrosesan dapat didemonstrasikan dan diuji unit di Node biasa. Demo tidak membuktikan algoritma signature; hal itu diverifikasi hanya pada fase backend.

## 5. Semester berasal dari satu service
- **Konteks:** form tagihan meng-hardcode tiga periode.
- **Alternatif:** menyimpan konstanta di dialog; menurunkan periode hanya dari tagihan yang ada.
- **Keputusan:** `semester.service.ts` (`GET /semesters` pada real mode) adalah satu-satunya sumber; `mergeSemesters` menjaga periode yang sudah dipakai tagihan tetap dapat dipilih. Value adalah string API, label hanya untuk tampilan.
- **Konsekuensi:** menambah periode tidak memerlukan perubahan komponen. Manajemen semester itu sendiri di luar cakupan.

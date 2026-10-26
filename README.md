# rekap.in

Dashboard pencatatan keuangan berbasis Vite dan Supabase Auth/Postgres. Transaksi awal sengaja kosong; saat akun dibuat, aplikasi hanya membuat profil, kategori dasar, dan dompet kosong untuk akun baru.

## Menjalankan aplikasi

1. Buat project Supabase.
2. Buka **SQL Editor** di Supabase, jalankan seluruh isi `supabase/schema.sql`.
3. Salin `.env.example` menjadi `.env.local` (PowerShell: `Copy-Item .env.example .env.local`), lalu isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dari pengaturan API project Supabase. Aplikasi juga menerima nama `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. Jangan gunakan atau menaruh `service_role` key di browser.
5. Pasang dependensi dan jalankan:

   ```sh
   npm install
   npm run dev
   ```

6. Buka URL lokal yang dicetak Vite, lalu daftar dengan nama, email, dan kata sandi. Jika konfirmasi email aktif di Supabase, verifikasi email sebelum masuk.

Setiap pengguna hanya dapat mengakses profil, dompet, kategori, transaksi, dan anggaran miliknya melalui kebijakan Row Level Security. Saldo dompet hanya dapat berubah melalui trigger transaksi di database. Kata sandi dikelola Supabase Auth dan tidak disimpan di tabel profil.

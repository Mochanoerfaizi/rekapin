-- Bersihkan SEMUA transaksi dan anggaran (bukan hanya yang berlabel TEST:).
-- Jalankan di Supabase SQL Editor -> PRIVATE -> Create a new snippet.
-- Saldo dompet dikembalikan otomatis oleh trigger saat transaksi dihapus.

delete from public.budgets;
delete from public.transactions;

-- Verifikasi: keduanya harus 0
select
  (select count(*) from public.transactions) as sisa_transaksi,
  (select count(*) from public.budgets)      as sisa_anggaran;

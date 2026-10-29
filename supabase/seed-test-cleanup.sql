-- Hapus SEMUA data palsu yang dibuat oleh supabase/seed-test.sql.
-- Jalankan di Supabase SQL Editor -> PRIVATE -> Create a new snippet.
-- Saldo dompet dikembalikan otomatis oleh trigger saat transaksi dihapus.

delete from public.budgets
where start_date = date_trunc('month', current_date)::date
  and target_amount in (1500000, 500000, 800000, 700000);

delete from public.transactions where notes like 'TEST:%';

-- Verifikasi: jumlah transaksi ber-catatan TEST: harus 0
select count(*) as sisa_data_palsu
from public.transactions
where notes like 'TEST:%';

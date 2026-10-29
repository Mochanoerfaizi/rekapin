-- Data PALSU untuk testing aplikasi. Bukan data keuangan sungguhan.
-- Jalankan di Supabase SQL Editor -> PRIVATE -> Create a new snippet.
-- Aman diulang: baris yang sama tidak akan digandakan.
--
-- Setelah selesai test, jalankan file terpisah:
--   supabase/seed-test-cleanup.sql

-- A. Cek data yang ada sekarang
select 'profiles'     as tabel, count(*) as jumlah from public.profiles
union all select 'accounts',     count(*) from public.accounts
union all select 'categories',   count(*) from public.categories
union all select 'transactions', count(*) from public.transactions
union all select 'budgets',      count(*) from public.budgets;

-- B. Transaksi palsu 7 hari terakhir (saldo dompet diupdate otomatis oleh trigger)
insert into public.transactions (user_id, account_id, category_id, amount, type, notes, date)
select
  a.user_id,
  a.id,
  c.id,
  v.amount,
  v.type,
  v.notes,
  current_date - v.days_ago
from (values
  ('Cash',      'Makanan',           'expense',  28000, 'TEST: Makan siang',       0),
  ('DANA',      'Belanja',           'expense',  89000, 'TEST: Belanja online',    1),
  ('Cash',      'Makanan',           'expense',  32000, 'TEST: Sarapan',           1),
  ('BCA',       'Transportasi',      'expense',  50000, 'TEST: Bensin',            2),
  ('Jago',      'Makanan',           'expense',  45000, 'TEST: Makan malam',       2),
  ('BCA',       'Pemasukan bulanan', 'income', 1500000, 'TEST: Freelance',         2),
  ('GoPay',     'Transportasi',      'expense',  25000, 'TEST: Ojek online',       3),
  ('Mandiri',   'Tagihan',           'expense', 200000, 'TEST: Internet',          3),
  ('BCA',       'Belanja',           'expense', 150000, 'TEST: Belanja bulanan',   4),
  ('Cash',      'Lainnya',           'expense',  20000, 'TEST: Parkir',            4),
  ('Cash',      'Tagihan',           'expense', 350000, 'TEST: Listrik',           5),
  ('ShopeePay', 'Belanja',           'expense',  67000, 'TEST: Skincare',          5),
  ('Cash',      'Pemasukan bulanan', 'income', 5000000, 'TEST: Gaji bulanan',      6),
  ('SeaBank',   'Hiburan',           'expense',  75000, 'TEST: Nonton bioskop',    6)
) as v(account_name, category_name, type, amount, notes, days_ago)
join public.accounts a on a.name = v.account_name
join public.categories c
  on c.user_id = a.user_id
 and c.name = v.category_name
 and c.type = v.type
where not exists (
  select 1
  from public.transactions t
  where t.user_id = a.user_id
    and t.notes = v.notes
    and t.date = current_date - v.days_ago
);

-- C. Anggaran palsu untuk bulan berjalan
insert into public.budgets (user_id, category_id, target_amount, period, start_date, end_date)
select
  c.user_id,
  c.id,
  v.target_amount,
  'monthly',
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date
from (values
  ('Makanan',      1500000),
  ('Transportasi',  500000),
  ('Belanja',       800000),
  ('Tagihan',       700000)
) as v(category_name, target_amount)
join public.categories c
  on c.name = v.category_name
 and c.type = 'expense'
where not exists (
  select 1
  from public.budgets b
  where b.user_id = c.user_id
    and b.category_id = c.id
    and b.start_date = date_trunc('month', current_date)::date
);

-- Cek hasil: transaksi harus muncul dengan catatan diawali 'TEST:'
select
  t.date,
  t.type,
  t.notes,
  t.amount,
  c.name as kategori,
  a.name as dompet,
  a.balance as saldo_dompet
from public.transactions t
join public.categories c on c.id = t.category_id
join public.accounts a on a.id = t.account_id
where t.notes like 'TEST:%'
order by t.date desc, t.created_at desc;

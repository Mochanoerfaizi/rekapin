-- Jalankan SELURUH file ini di Supabase SQL Editor (satu kali Run).
-- Tujuan: memperbaiki akun yang dibuat saat trigger belum ada,
--         sekaligus memasang ulang trigger untuk pendaftaran baru.
-- Aman diulang (idempoten): data yang sudah ada tidak akan digandakan.

-- A. Pasang ulang trigger pembuat data awal
-- (DROP/CREATE trigger dibungkus DO+EXECUTE karena parser SQL Editor
--  Supabase tidak mengenali sintaks DROP TRIGGER secara langsung)
do $$
begin
  execute 'drop trigger if exists on_auth_user_created on auth.users';
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  insert into public.accounts (user_id, name, type)
  values
    (new.id, 'Cash', 'cash'),
    (new.id, 'BCA', 'bank'),
    (new.id, 'Jago', 'bank'),
    (new.id, 'SeaBank', 'bank'),
    (new.id, 'GoPay', 'e-wallet'),
    (new.id, 'Mandiri', 'bank'),
    (new.id, 'ShopeePay', 'e-wallet'),
    (new.id, 'DANA', 'e-wallet')
  on conflict (user_id, name) do nothing;

  insert into public.categories (user_id, name, type, icon)
  values
    (new.id, 'Makanan', 'expense', '🍜'),
    (new.id, 'Transportasi', 'expense', '🚗'),
    (new.id, 'Belanja', 'expense', '🛍️'),
    (new.id, 'Tagihan', 'expense', '💡'),
    (new.id, 'Hiburan', 'expense', '🎵'),
    (new.id, 'Lainnya', 'expense', '✦'),
    (new.id, 'Pemasukan bulanan', 'income', '↙')
  on conflict (user_id, name, type) do nothing;

  return new;
end;
$$;

do $$
begin
  execute 'create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user()';
exception
  when duplicate_object then null; -- sudah terpasang, biarkan
end;
$$;

-- B. Lengkapi data untuk semua akun yang sudah terdaftar
do $$
declare
  u record;
begin
  for u in
    select au.id,
           coalesce(au.raw_user_meta_data ->> 'name', '') as name,
           coalesce(au.email, '') as email
    from auth.users au
  loop
    insert into public.profiles (id, name, email)
    values (u.id, u.name, u.email)
    on conflict (id) do nothing;

    insert into public.accounts (user_id, name, type)
    values
      (u.id, 'Cash', 'cash'),
      (u.id, 'BCA', 'bank'),
      (u.id, 'Jago', 'bank'),
      (u.id, 'SeaBank', 'bank'),
      (u.id, 'GoPay', 'e-wallet'),
      (u.id, 'Mandiri', 'bank'),
      (u.id, 'ShopeePay', 'e-wallet'),
      (u.id, 'DANA', 'e-wallet')
    on conflict (user_id, name) do nothing;

    insert into public.categories (user_id, name, type, icon)
    values
      (u.id, 'Makanan', 'expense', '🍜'),
      (u.id, 'Transportasi', 'expense', '🚗'),
      (u.id, 'Belanja', 'expense', '🛍️'),
      (u.id, 'Tagihan', 'expense', '💡'),
      (u.id, 'Hiburan', 'expense', '🎵'),
      (u.id, 'Lainnya', 'expense', '✦'),
      (u.id, 'Pemasukan bulanan', 'income', '↙')
    on conflict (user_id, name, type) do nothing;
  end loop;
end;
$$;

-- C. Verifikasi — kolom ada_profil harus TRUE, dompet = 8, kategori = 7
select
  u.email,
  (p.id is not null) as ada_profil,
  coalesce(p.name, '(KOSONG)') as nama,
  (select count(*) from public.accounts a where a.user_id = u.id) as dompet,
  (select count(*) from public.categories c where c.user_id = u.id) as kategori
from auth.users u
left join public.profiles p on p.id = u.id;

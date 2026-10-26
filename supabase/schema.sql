create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  currency text not null default 'IDR',
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'e-wallet')),
  balance numeric(16, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  icon text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, name, type),
  unique (user_id, id),
  unique (user_id, id, type)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  category_id uuid not null,
  amount numeric(16, 2) not null check (amount > 0),
  type text not null check (type in ('expense', 'income')),
  notes text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete cascade,
  foreign key (user_id, category_id, type)
    references public.categories (user_id, id, type) on delete restrict
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  target_amount numeric(16, 2) not null check (target_amount > 0),
  period text not null check (period in ('daily', 'monthly', 'yearly')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade
);

create index transactions_user_date_idx
  on public.transactions (user_id, date desc);
create index transactions_user_category_idx
  on public.transactions (user_id, category_id);
create index budgets_user_dates_idx
  on public.budgets (user_id, start_date, end_date);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

revoke all on public.profiles, public.accounts, public.categories,
  public.transactions, public.budgets from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.accounts to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

create policy "Users can read their profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "Users can update their profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users can manage their accounts"
  on public.accounts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can manage their categories"
  on public.categories for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can manage their transactions"
  on public.transactions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can manage their budgets"
  on public.budgets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.handle_new_user()
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
  );

  insert into public.accounts (user_id, name, type)
  values
    (new.id, 'Cash', 'cash'),
    (new.id, 'BCA', 'bank'),
    (new.id, 'Jago', 'bank'),
    (new.id, 'SeaBank', 'bank'),
    (new.id, 'GoPay', 'e-wallet'),
    (new.id, 'Mandiri', 'bank'),
    (new.id, 'ShopeePay', 'e-wallet'),
    (new.id, 'DANA', 'e-wallet');

  insert into public.categories (user_id, name, type, icon)
  values
    (new.id, 'Makanan', 'expense', '🍜'),
    (new.id, 'Transportasi', 'expense', '🚗'),
    (new.id, 'Belanja', 'expense', '🛍️'),
    (new.id, 'Tagihan', 'expense', '💡'),
    (new.id, 'Hiburan', 'expense', '🎵'),
    (new.id, 'Lainnya', 'expense', '✦'),
    (new.id, 'Pemasukan bulanan', 'income', '↙');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.validate_transaction_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.categories c
    where c.id = new.category_id
      and c.user_id = new.user_id
      and c.type = new.type
  ) then
    raise exception 'Transaction category must belong to this user and match its type';
  end if;

  return new;
end;
$$;

create trigger validate_transaction_category
  before insert or update of user_id, category_id, type
  on public.transactions
  for each row execute procedure public.validate_transaction_links();

create function public.apply_transaction_to_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.accounts
    set balance = balance + case when old.type = 'income' then -old.amount else old.amount end
    where id = old.account_id and user_id = old.user_id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    update public.accounts
    set balance = balance + case when old.type = 'income' then -old.amount else old.amount end
    where id = old.account_id and user_id = old.user_id;
  end if;

  update public.accounts
  set balance = balance + case when new.type = 'income' then new.amount else -new.amount end
  where id = new.account_id and user_id = new.user_id;

  return new;
end;
$$;

create trigger update_account_balance
  after insert or update or delete on public.transactions
  for each row execute procedure public.apply_transaction_to_account();

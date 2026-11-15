-- Budget Manager: core tables with row-level security.
--
-- Every row belongs to one Supabase Auth user (user_id). Row-level security
-- (RLS) is on for every table, and each policy only lets a signed-in user see
-- and change their own rows. The anonymous (logged-out) role gets nothing.
--
-- Money convention: amount < 0 is money out, amount > 0 is money in.

-- ---------------------------------------------------------------------------
-- Accounts: bank, card and cash accounts (from Plaid, an upload, or by hand)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 100),
  institution        text,
  type               text not null default 'checking'
                       check (type in ('checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'other')),
  source             text not null default 'manual'
                       check (source in ('plaid', 'upload', 'manual')),
  plaid_account_id   text unique,
  mask               text check (mask ~ '^[0-9]{2,4}$'),  -- last digits only, never a full number
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  current_balance    numeric(14, 2),
  balance_updated_at timestamptz,
  is_hidden          boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Categories: what a transaction is for (Groceries, Rent, Paycheck...)
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  group_name  text,
  kind        text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text,
  is_excluded boolean not null default false,  -- left out of spending totals
  created_at  timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Imports: one row per uploaded CSV, OFX file or screenshot
-- ---------------------------------------------------------------------------
create table public.imports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id  uuid not null,
  file_name   text not null,
  kind        text not null check (kind in ('csv', 'ofx', 'screenshot')),
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  row_count   integer not null default 0 check (row_count >= 0),
  created_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id           uuid not null,
  category_id          uuid,
  import_id            uuid,
  posted_on            date not null,
  description          text not null,
  merchant             text,
  amount               numeric(14, 2) not null,
  pending              boolean not null default false,
  source               text not null default 'manual' check (source in ('plaid', 'upload', 'manual')),
  plaid_transaction_id text unique,
  -- Same date + amount + cleaned description on the same account = same
  -- transaction, so an upload that overlaps Plaid data isn't counted twice.
  fingerprint          text not null,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, fingerprint),
  -- The composite keys make sure a transaction can only point at the same
  -- user's account, category and import.
  foreign key (account_id, user_id)  references public.accounts (id, user_id)   on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (import_id, user_id)   references public.imports (id, user_id)    on delete set null (import_id)
);

create index transactions_user_date_idx on public.transactions (user_id, posted_on desc);
create index transactions_account_idx   on public.transactions (account_id);
create index transactions_category_idx  on public.transactions (category_id);
create index transactions_import_idx    on public.transactions (import_id);
create index imports_account_idx        on public.imports (account_id);

-- ---------------------------------------------------------------------------
-- Budgets: a monthly amount per category.
-- month is the first day of the month; null means "every month" (default).
-- ---------------------------------------------------------------------------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  month       date check (month is null or extract(day from month) = 1),
  amount      numeric(14, 2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, category_id, month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create index budgets_category_idx on public.budgets (category_id);

-- ---------------------------------------------------------------------------
-- Keep transactions.updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: each signed-in user sees and changes only their rows
-- ---------------------------------------------------------------------------
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.imports      enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

-- Logged-out visitors get no access at all, even before policies are checked.
revoke all on public.accounts, public.categories, public.imports,
              public.transactions, public.budgets from anon;

create policy "Own accounts" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own imports" on public.imports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own transactions" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own budgets" on public.budgets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Plaid connections.
--
-- One row per bank login connected through Plaid (Plaid calls it an "Item").
-- The access_token lets the server read that bank's accounts and
-- transactions, so nobody using the app can read this table: RLS is on with
-- no policies, and the anon and authenticated roles have no grants. Only the
-- server, using the service role key, reads and writes it.

create table public.plaid_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  item_id          text not null unique,
  access_token     text not null,
  environment      text not null check (environment in ('sandbox', 'production')),
  institution_id   text,
  institution_name text,
  sync_cursor      text,                       -- where /transactions/sync left off
  last_synced_at   timestamptz,
  last_error       text,                       -- Plaid error code from the last sync, if any
  created_at       timestamptz not null default now()
);

create index plaid_items_user_idx on public.plaid_items (user_id);

alter table public.plaid_items enable row level security;
revoke all on public.plaid_items from anon, authenticated;

-- Link accounts to the connection they came from. Removing a connection
-- keeps its accounts and history; they just stop updating.
alter table public.accounts
  add column plaid_item_id uuid references public.plaid_items (id) on delete set null;

create index accounts_plaid_item_idx on public.accounts (plaid_item_id);

-- Plaid's own category for each transaction (for example FOOD_AND_DRINK),
-- kept so transactions can be sorted into your categories later.
alter table public.transactions
  add column plaid_category text;

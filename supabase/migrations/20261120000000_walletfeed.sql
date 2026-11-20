-- Apple Wallet through WalletFeed.
--
-- WalletFeed is an iPhone app that reads Apple Card, Apple Cash and Apple
-- Savings with Apple's FinanceKit and posts each change to a web address.
-- Every post is signed with a secret only WalletFeed and this site know, so
-- the endpoint (/api/wallet/<feed id>) acts only on real WalletFeed posts.
--
-- All three tables are server-only, like plaid_items: RLS is on with no
-- policies and nobody using the app can read them directly. The Banks page
-- reads them on the server after checking your two-factor sign-in.

-- One feed per user: the random id in its web address and its signing secret.
create table public.wallet_feeds (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  feed_id        uuid not null unique default gen_random_uuid(),
  signing_secret text check (signing_secret ~ '^whsec_[A-Za-z0-9+/=]{16,200}$'),
  secret_set_at  timestamptz,
  last_event_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- Each Wallet account WalletFeed tells us about, and which of your accounts
-- it fills. account_id stays empty until you pick one on the Banks page.
create table public.wallet_accounts (
  user_id           uuid not null references auth.users (id) on delete cascade,
  wallet_account_id text not null check (char_length(wallet_account_id) <= 200),
  name              text check (char_length(name) <= 200),
  institution       text check (char_length(institution) <= 200),
  account_type      text check (account_type in ('asset', 'liability')),
  account_id        uuid references public.accounts (id) on delete set null,
  linked_at         timestamptz,                 -- when you last picked the account
  balance           numeric(14, 2),              -- in this app's terms: owed on a card, money in an asset
  balance_as_of     timestamptz,
  removed_at        timestamptz,
  created_at        timestamptz not null default now(),
  primary key (user_id, wallet_account_id)
);

-- Every Wallet transaction as WalletFeed last described it, so linking an
-- account later still brings in what arrived before.
create table public.wallet_transactions (
  user_id               uuid not null references auth.users (id) on delete cascade,
  wallet_transaction_id text not null check (char_length(wallet_transaction_id) <= 200),
  wallet_account_id     text not null check (char_length(wallet_account_id) <= 200),
  posted_on             date not null,
  description           text not null check (char_length(description) <= 500),
  merchant              text check (char_length(merchant) <= 200),
  amount                numeric(14, 2) not null,
  pending               boolean not null,
  bank_category         text check (char_length(bank_category) <= 100),
  from_history          boolean not null default false,
  updated_at            timestamptz not null default now(),
  primary key (user_id, wallet_transaction_id)
);

-- What happened to each post (event type and outcome only, never amounts).
create table public.wallet_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  webhook_id  text not null check (char_length(webhook_id) <= 100),
  event_type  text not null check (char_length(event_type) <= 100),
  test        boolean not null default false,
  outcome     text not null check (outcome in ('saved', 'ignored', 'duplicate', 'failed')),
  detail      text check (char_length(detail) <= 300),
  created_at  timestamptz not null default now()
);

create index wallet_events_user_idx on public.wallet_events (user_id, created_at desc);
create index wallet_events_webhook_idx on public.wallet_events (user_id, webhook_id);
create index wallet_accounts_account_idx on public.wallet_accounts (account_id);
create index wallet_transactions_account_idx on public.wallet_transactions (user_id, wallet_account_id);

alter table public.wallet_feeds        enable row level security;
alter table public.wallet_accounts     enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_events       enable row level security;
revoke all on public.wallet_feeds, public.wallet_accounts, public.wallet_transactions, public.wallet_events
  from anon, authenticated;

-- WalletFeed is a new place transactions can come from. A transaction that
-- came from WalletFeed, or an uploaded one WalletFeed matched, keeps the
-- Wallet transaction's id, so a pending purchase and its posted version stay
-- one row.
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('plaid', 'upload', 'manual', 'email', 'wallet'));
alter table public.transactions add column wallet_transaction_id text;
alter table public.transactions
  add constraint transactions_wallet_transaction_unique unique (user_id, wallet_transaction_id);

-- Phone alerts (web push) when new transactions wait under "Pending to
-- review". Open the site from the iPhone home screen, turn alerts on in
-- Settings > Phone alerts, and the phone gets a notification whenever the
-- morning bank sync, WalletFeed or a Venmo email brings in something new.
--
-- All three tables are server-only, like wallet_feeds: RLS is on with no
-- policies, so nobody using the app can read them directly. The site reads
-- them on the server after checking your two-factor sign-in.

-- The site's own push key pair (VAPID). Made by the server the first time
-- alerts are turned on, so there is nothing to paste into Vercel. Only one
-- row can exist.
create table public.push_keys (
  id          boolean primary key default true check (id),
  public_key  text not null check (char_length(public_key) <= 200),
  private_key text not null check (char_length(private_key) <= 200),
  created_at  timestamptz not null default now()
);

-- One row per phone or browser that turned alerts on. The endpoint is the
-- push service's address for that device (Apple, Google, Mozilla or
-- Microsoft), and p256dh and auth are the device's keys for encrypting the
-- alert.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh       text not null check (char_length(p256dh) <= 200),
  auth         text not null check (char_length(auth) <= 100),
  device       text check (char_length(device) <= 100),
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Up to when you've already been told about new transactions, so each one
-- is announced once.
create table public.push_state (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  notified_until timestamptz not null default now()
);

-- Finds new transactions to review quickly.
create index transactions_review_created_idx
  on public.transactions (user_id, created_at)
  where reviewed_at is null;

alter table public.push_keys          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_state         enable row level security;
revoke all on public.push_keys, public.push_subscriptions, public.push_state from anon, authenticated;

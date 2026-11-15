-- Venmo by email.
--
-- Venmo isn't connected through Plaid. Instead, Venmo's own emails are
-- forwarded to the app (Gmail filter -> Cloudflare Email Routing -> the app's
-- /api/venmo/inbound endpoint). The endpoint checks each email's DKIM
-- signature so only real Venmo emails count, then adds the transaction and
-- moves the Venmo balance. You type the starting balance once.

-- Email is a new place accounts and transactions can come from.
alter table public.accounts drop constraint accounts_source_check;
alter table public.accounts add constraint accounts_source_check
  check (source in ('plaid', 'upload', 'manual', 'email'));
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('plaid', 'upload', 'manual', 'email'));

-- One Venmo feed per user: which account it fills and which address it
-- listens on.
create table public.venmo_feeds (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  account_id            uuid not null,
  inbound_address       text not null unique check (inbound_address ~ '^[a-z0-9._+-]+@[a-z0-9.-]+$'),
  -- Your own mailbox that Venmo emails go to. Only emails Venmo signed as
  -- sent to this address count, so someone else's real Venmo emails can't.
  mailbox               text not null check (mailbox ~ '^[^@\s]+@[^@\s]+$'),
  -- Emails sent before this moment are already counted in the balance you
  -- typed, so they're saved but don't move the balance again.
  balance_set_at        timestamptz not null default now(),
  last_email_at         timestamptz,
  -- Gmail sends a code to confirm a new forwarding address; it's shown on
  -- the Banks page so you can type it into Gmail.
  gmail_confirmation    text check (gmail_confirmation ~ '^[0-9]{6,12}$'),
  gmail_confirmation_at timestamptz,
  created_at            timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

-- What happened to each forwarded email (subject only, never the body).
create table public.venmo_emails (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  received_at    timestamptz not null,
  subject        text not null check (char_length(subject) <= 300),
  outcome        text not null check (outcome in ('added', 'duplicate', 'skipped', 'ignored', 'unverified', 'failed')),
  detail         text check (char_length(detail) <= 300),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index venmo_emails_user_idx on public.venmo_emails (user_id, created_at desc);
create index venmo_emails_transaction_idx on public.venmo_emails (transaction_id);
create index venmo_feeds_account_idx on public.venmo_feeds (account_id);

-- You can read your own feed and email log; only the server writes them.
alter table public.venmo_feeds  enable row level security;
alter table public.venmo_emails enable row level security;
revoke all on public.venmo_feeds, public.venmo_emails from anon;
revoke insert, update, delete, truncate on public.venmo_feeds, public.venmo_emails from authenticated;

create policy "Own Venmo feed" on public.venmo_feeds
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own Venmo emails" on public.venmo_emails
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Require two-factor" on public.venmo_feeds as restrictive
  for all to authenticated using ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "Require two-factor" on public.venmo_emails as restrictive
  for all to authenticated using ((select auth.jwt() ->> 'aal') = 'aal2');

-- Adds one Venmo transaction and moves the balance, in one step, so two
-- emails arriving at once can't miscount. Returns the new transaction's id,
-- or null when that Venmo transaction was already saved.
create function public.add_venmo_transaction(
  p_user_id     uuid,
  p_posted_on   date,
  p_description text,
  p_merchant    text,
  p_amount      numeric,
  p_notes       text,
  p_fingerprint text,
  p_email_at    timestamptz
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_feed public.venmo_feeds;
  v_id   uuid;
begin
  select * into v_feed from public.venmo_feeds where user_id = p_user_id for update;
  if not found then
    raise exception 'No Venmo feed for this user';
  end if;

  insert into public.transactions
    (user_id, account_id, posted_on, description, merchant, amount, pending, source, fingerprint, notes)
  values
    (p_user_id, v_feed.account_id, p_posted_on, p_description, p_merchant, p_amount, false, 'email', p_fingerprint, p_notes)
  on conflict (user_id, fingerprint) do nothing
  returning id into v_id;

  if v_id is not null and p_email_at >= v_feed.balance_set_at then
    update public.accounts
       set current_balance = coalesce(current_balance, 0) + p_amount,
           balance_updated_at = now()
     where id = v_feed.account_id and user_id = p_user_id;
  end if;

  update public.venmo_feeds
     set last_email_at = greatest(coalesce(last_email_at, p_email_at), p_email_at)
   where user_id = p_user_id;

  return v_id;
end;
$$;

revoke all on function public.add_venmo_transaction(uuid, date, text, text, numeric, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.add_venmo_transaction(uuid, date, text, text, numeric, text, text, timestamptz)
  to service_role;

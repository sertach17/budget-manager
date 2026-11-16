-- Goals: money you're saving toward something, like a trip.
--
-- A goal can follow one of your accounts. set_aside is how much of that
-- account's balance counts toward the goal; null means all of it. With no
-- account, set_aside is what you've already saved, typed by hand.
--
-- Transactions can also be tagged to a goal (transactions.goal_id) while
-- they keep their budget category. Money in adds to the goal and money out
-- takes from it. When a goal counts an account's whole balance, tagged
-- transactions in that same account are already in the balance, so the app
-- doesn't add them again.
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date   date,
  account_id    uuid,
  set_aside     numeric(14, 2) check (set_aside is null or set_aside >= 0),
  created_at    timestamptz not null default now(),
  unique (id, user_id),
  -- Only one of your own accounts. Deleting the account leaves the goal.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);

create index goals_account_idx on public.goals (account_id);

alter table public.transactions add column goal_id uuid;
alter table public.transactions
  add constraint transactions_goal_fk
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id);
create index transactions_goal_idx on public.transactions (goal_id) where goal_id is not null;

alter table public.goals enable row level security;
revoke all on public.goals from anon;

create policy "Own goals" on public.goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- AI agents you connect (Claude, ChatGPT and others) through the app's MCP
-- connection.
--
-- An agent signs in through Supabase's OAuth server with your login and
-- two-factor, and you approve it on the app's consent page. Its access token
-- is a normal Supabase token for you plus a client_id claim naming the agent,
-- so row-level security still limits it to your rows. The rules below add
-- what an agent may not do, on top of what you may do yourself:
--
--   - it never deletes anything;
--   - it never touches categories, uploads, bank links or the Venmo feed;
--   - it never adds or renames an account; it can only move the balance of
--     an account you keep yourself, when it adds a transaction there;
--   - on a transaction it can only change the category, the goal and the
--     reviewed mark; it can add one, but never change the amount, date or
--     description of one that's already there.
--
-- Every change an agent makes is written to agent_activity, which you see
-- on the Connected agents page. Agents can add to it, never change it.

-- True when the request comes from a connected agent rather than from you.
create function public.is_agent() returns boolean
language sql stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'client_id', '') is not null
$$;

-- An agent's token keeps working only while its sign-in does. When you
-- disconnect an agent, Supabase ends its sessions, so this turns it away at
-- once instead of when its token runs out. auth.sessions isn't readable by
-- signed-in users, hence security definer; it only answers yes or no.
create function public.agent_still_connected() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not public.is_agent()
    or exists (
      select 1 from auth.sessions s
      where s.id::text = auth.jwt() ->> 'session_id'
        and s.user_id = auth.uid()
    )
$$;
revoke all on function public.agent_still_connected() from public, anon;
grant execute on function public.agent_still_connected() to authenticated;

do $mig$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'imports', 'transactions', 'budgets', 'goals', 'venmo_feeds', 'venmo_emails'] loop
    execute format(
      'create policy "Agents only while connected" on public.%I as restrictive for all to authenticated
         using ((select public.agent_still_connected()))
         with check ((select public.agent_still_connected()))', t);
  end loop;
end
$mig$;

-- Goals were missing the two-factor rule the other tables have.
create policy "Require two-factor" on public.goals as restrictive
  for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- What agents may not do
-- ---------------------------------------------------------------------------

-- No deleting, anywhere.
do $mig$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'imports', 'transactions', 'budgets', 'goals'] loop
    execute format(
      'create policy "Agents never delete" on public.%I as restrictive for delete to authenticated
         using (not (select public.is_agent()))', t);
  end loop;
end
$mig$;

-- Categories and uploads are read-only to agents.
do $mig$
declare
  t text;
begin
  foreach t in array array['categories', 'imports'] loop
    execute format(
      'create policy "Agents only read" on public.%I as restrictive for insert to authenticated
         with check (not (select public.is_agent()))', t);
    execute format(
      'create policy "Agents only read (update)" on public.%I as restrictive for update to authenticated
         using (not (select public.is_agent()))', t);
  end loop;
end
$mig$;

-- Agents can't add accounts.
create policy "Agents never add accounts" on public.accounts as restrictive
  for insert to authenticated
  with check (not (select public.is_agent()));

-- Agents can't update a linked bank's account at all.
create policy "Agents only move your own balances" on public.accounts as restrictive
  for update to authenticated
  using (not (select public.is_agent()) or source in ('manual', 'upload'))
  with check (not (select public.is_agent()) or source in ('manual', 'upload'));

-- The Venmo feed is read-only to everyone already; agents can't read it.
create policy "Agents never read the Venmo feed" on public.venmo_feeds as restrictive
  for select to authenticated
  using (not (select public.is_agent()));
create policy "Agents never read Venmo emails" on public.venmo_emails as restrictive
  for select to authenticated
  using (not (select public.is_agent()));

-- Which columns an agent may change. A trigger, because policies can't look
-- at columns.
create function public.agent_column_limits() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_agent() then
    return new;
  end if;

  if tg_table_name = 'accounts' then
    if (to_jsonb(new) - 'current_balance') is distinct from (to_jsonb(old) - 'current_balance') then
      raise exception 'An agent can only move an account''s balance.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'transactions' then
    if (to_jsonb(new) - array['category_id', 'goal_id', 'reviewed_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['category_id', 'goal_id', 'reviewed_at', 'updated_at']) then
      raise exception 'An agent can only change a transaction''s category, goal or reviewed mark.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create trigger agent_column_limits before update on public.accounts
  for each row execute function public.agent_column_limits();
create trigger agent_column_limits before update on public.transactions
  for each row execute function public.agent_column_limits();

-- Agents add transactions only by hand-typed entry, never as a bank's.
create policy "Agents add only typed transactions" on public.transactions as restrictive
  for insert to authenticated
  with check (not (select public.is_agent()) or (source = 'manual' and import_id is null));

-- ---------------------------------------------------------------------------
-- What agents did
-- ---------------------------------------------------------------------------
create table public.agent_activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  text not null check (char_length(client_id) between 1 and 200),
  tool       text not null check (char_length(tool) between 1 and 60),
  summary    text not null check (char_length(summary) between 1 and 300),
  created_at timestamptz not null default now()
);

create index agent_activity_user_idx on public.agent_activity (user_id, created_at desc);

alter table public.agent_activity enable row level security;
revoke all on public.agent_activity from anon;
revoke update, delete, truncate on public.agent_activity from authenticated;

create policy "Own agent activity" on public.agent_activity
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only an agent writes here, and only under its own name.
create policy "Agents log their own changes" on public.agent_activity
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and client_id = (select auth.jwt() ->> 'client_id')
  );

create policy "Agents only while connected" on public.agent_activity as restrictive
  for all to authenticated
  using ((select public.agent_still_connected()))
  with check ((select public.agent_still_connected()));

create policy "Require two-factor" on public.agent_activity as restrictive
  for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

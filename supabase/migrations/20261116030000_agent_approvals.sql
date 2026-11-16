-- Agents sign in without two-factor, so you allow each sign-in with it.
--
-- Supabase's OAuth server gives an agent's sign-in assurance level aal1 even
-- when you approved it with two-factor, so the "Require two-factor" rules
-- turned every connected agent away. This adds the missing link: when you
-- press Allow on the app's consent page, which needs your two-factor
-- session, the app records that you allowed that agent just now. An agent's
-- sign-in then counts as two-factor only if it started within 15 minutes
-- after one of those approvals, for the same agent.
--
-- So someone with only your password still gets nothing: they can't record
-- an approval (that needs aal2), and an agent you allowed before can't start
-- a new sign-in without you allowing it again with two-factor.

create table public.agent_approvals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_id   uuid not null,
  approved_at timestamptz not null default now()
);

create index agent_approvals_user_client_idx on public.agent_approvals (user_id, client_id, approved_at desc);

alter table public.agent_approvals enable row level security;
revoke all on public.agent_approvals from anon;
-- Written only by approve_agent_request() below.
revoke insert, update, delete, truncate on public.agent_approvals from authenticated;

create policy "Own agent approvals" on public.agent_approvals
  for select to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2');

-- Called by the consent page when you press Allow. Needs your own two-factor
-- session (never an agent's), and an agent request that's still open.
-- Returns the agent's id.
create function public.approve_agent_request(p_authorization_id text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  found_client uuid;
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2' or public.is_agent() or auth.uid() is null then
    raise exception 'Allowing an agent needs your two-factor sign-in.' using errcode = '42501';
  end if;

  select a.client_id into found_client
  from auth.oauth_authorizations a
  where a.authorization_id = p_authorization_id
    and (a.user_id is null or a.user_id = auth.uid())
    and a.expires_at > now();

  if found_client is null then
    raise exception 'That agent request expired.' using errcode = 'P0002';
  end if;

  insert into public.agent_approvals (user_id, client_id) values (auth.uid(), found_client);
  return found_client;
end
$$;
revoke all on function public.approve_agent_request(text) from public, anon;
grant execute on function public.approve_agent_request(text) to authenticated;

-- True for an agent whose sign-in started right after you allowed it with
-- two-factor, and is still alive.
create function public.agent_approved() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_agent()
    and exists (
      select 1
      from auth.sessions s
      join public.agent_approvals a
        on a.user_id = s.user_id
       and a.client_id = s.oauth_client_id
      where s.id::text = auth.jwt() ->> 'session_id'
        and s.user_id = auth.uid()
        and s.oauth_client_id::text = auth.jwt() ->> 'client_id'
        and s.created_at >= a.approved_at - interval '1 minute'
        and s.created_at <= a.approved_at + interval '15 minutes'
    )
$$;
revoke all on function public.agent_approved() from public, anon;
grant execute on function public.agent_approved() to authenticated;

-- Two-factor, or an agent you allowed with two-factor. Venmo stays
-- two-factor only; agents can't read it anyway.
do $mig$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'imports', 'transactions', 'budgets', 'goals', 'agent_activity'] loop
    execute format(
      'alter policy "Require two-factor" on public.%I
         using ((select auth.jwt() ->> %L) = %L or (select public.agent_approved()))
         with check ((select auth.jwt() ->> %L) = %L or (select public.agent_approved()))',
      t, 'aal', 'aal2', 'aal', 'aal2');
  end loop;
end
$mig$;

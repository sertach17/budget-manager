-- Require two-factor at the database too, not only in the app.
--
-- A restrictive policy is ANDed with the "Own ..." policies from the first
-- migration, so a signed-in user can only reach their rows after entering an
-- authenticator code in this session (assurance level aal2). A stolen
-- password alone gets nothing from the database.
do $mig$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'imports', 'transactions', 'budgets'] loop
    execute format(
      'create policy "Require two-factor" on public.%I as restrictive for all to authenticated
         using ((select auth.jwt() ->> %L) = %L)
         with check ((select auth.jwt() ->> %L) = %L)',
      t, 'aal', 'aal2', 'aal', 'aal2');
  end loop;
end
$mig$;

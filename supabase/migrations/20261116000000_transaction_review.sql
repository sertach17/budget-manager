-- Reviewed marks. A transaction with no reviewed_at waits under "Pending to
-- review" on the dashboard until you mark it reviewed.
--
-- Every transaction already here counts as reviewed, so only ones that
-- arrive from now on wait for review.
alter table public.transactions add column reviewed_at timestamptz;

update public.transactions set reviewed_at = now() where reviewed_at is null;

create index transactions_to_review_idx
  on public.transactions (user_id, posted_on desc)
  where reviewed_at is null;

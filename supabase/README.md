# Database

The database is a Supabase Postgres project (budget-manager-db), connected to
the Vercel project through Vercel's Supabase integration, so its keys live only
in Vercel's environment settings. Nothing secret belongs in this repo.

## Migrations

Files in `migrations/` run in name order. To apply one, open the Supabase
dashboard, go to **SQL Editor**, paste the file and press **Run**.

| File | What it does |
| --- | --- |
| `20261115000000_budget_tables.sql` | Accounts, categories, imports, transactions and budgets, each locked with row-level security so a signed-in user only sees their own rows |

## Conventions

- Every table has `user_id`, filled in from the signed-in user.
- `amount` below zero is money out, above zero is money in.
- `fingerprint` on a transaction stops the same transaction from being counted
  twice when an upload overlaps data from Plaid.

# Database

The database is a Supabase Postgres project (budget-manager-db), connected to
the Vercel project through Vercel's Supabase integration, so its keys live only
in Vercel's environment settings. Nothing secret belongs in this repo.

## Migrations

Files in `migrations/` run in name order. To apply one, open the Supabase
dashboard, go to **SQL Editor**, paste the file and press **Run**.

Vercel's **Query** tab for the database runs only one statement at a time, so
there the file has to be wrapped in one block (turn off Read-only first, and
back on after):

```sql
do $mig$ begin execute $q$
-- paste the migration file here
$q$; end $mig$;
```

| File | Applied |
| --- | --- |
| `20261115000000_budget_tables.sql` | Nov 15, 2026, through Vercel's Query tab |
| `20261115010000_require_two_factor.sql` | Nov 15, 2026 via the Query tab |

`20261115010000_require_two_factor.sql` is already one block, so it can be
pasted into either editor as is.

| File | What it does |
| --- | --- |
| `20261115000000_budget_tables.sql` | Accounts, categories, imports, transactions and budgets, each locked with row-level security so a signed-in user only sees their own rows |

## Conventions

- Every table has `user_id`, filled in from the signed-in user.
- `amount` below zero is money out, above zero is money in.
- `fingerprint` on a transaction stops the same transaction from being counted
  twice when an upload overlaps data from Plaid.

## Login settings (Supabase dashboard)

The app signs in with email and password, then asks for a 6-digit code from an
authenticator app. Accounts are invitation only. These are set in the Supabase
dashboard, not in code:

- **Authentication → Sign In / Providers:** "Allow new users to sign up" off.
- **Authentication → URL Configuration:** Site URL `https://budget.torrezhq.com`,
  plus redirect URL `https://budget.torrezhq.com/**`.
- **Emails:** the default Supabase emails are used for now (custom SMTP is
  needed to edit them). Their links come back to the Site URL with the session
  in the URL fragment; `src/app/login/email-link.tsx` picks that up. If custom
  SMTP is added later, point the Invite and Reset password links at
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (or
  `type=recovery`), which `src/app/auth/confirm/route.ts` handles.
- **Authentication → Multi-Factor:** TOTP (authenticator app) enabled.

To add a person: **Authentication → Users → Invite user**. The invite link
signs them in, then they choose a password and scan the two-factor QR code.

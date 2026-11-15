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
| `20261115020000_plaid_items.sql` | Nov 15, 2026 |
| `20261115030000_venmo_email_feed.sql` | Nov 15, 2026 |
| `20261115040000_gmail_confirm_link.sql` | Nov 15, 2026 |

`20261115010000_require_two_factor.sql` is already one block, so it can be
pasted into either editor as is.

| File | What it does |
| --- | --- |
| `20261115000000_budget_tables.sql` | Accounts, categories, imports, transactions and budgets, each locked with row-level security so a signed-in user only sees their own rows |
| `20261115010000_require_two_factor.sql` | Those tables also require a session that passed two-factor (aal2) |
| `20261115020000_plaid_items.sql` | Plaid connections and their access tokens, readable only by the server's service role; links accounts to their connection and keeps Plaid's category on each transaction |
| `20261115030000_venmo_email_feed.sql` | Venmo from forwarded emails: the feed settings, a log of each email's outcome, and a function that adds one Venmo transaction and moves the balance together (see `cloudflare/venmo-email-worker/README.md`) |
| `20261115040000_gmail_confirm_link.sql` | Keeps Gmail's forwarding confirm link (Google's own hosts only) for emails that carry a link instead of a code |

## Conventions

- Every table has `user_id`, filled in from the signed-in user.
- `amount` below zero is money out, above zero is money in.
- `fingerprint` on a transaction stops the same transaction from being counted
  twice. Plaid transactions use `plaid:<transaction id>`; Venmo uses
  `venmo:<transaction id>` and `venmo-transfer:<transfer id>`.

## Plaid keys (Vercel environment variables)

| Name | Where | Value |
| --- | --- | --- |
| `PLAID_CLIENT_ID` | Production and Preview | Client ID from Plaid's keys page (dashboard.plaid.com/developers/keys) |
| `PLAID_SECRET` | Preview | Sandbox secret (Plaid's fake bank) |
| `PLAID_SECRET` | Production | Production secret (real banks), saved as type Secret |
| `PLAID_ENV` | optional | `sandbox` or `production`; without it, the live site uses production and previews use sandbox |

All three were added in Vercel on Nov 15, 2026. Vercel only reads new values on
the next build, so redeploy after changing one.

Plaid's free Trial plan allows 10 bank connections in production. Removing a
connection doesn't give the slot back, so test with the sandbox first.

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

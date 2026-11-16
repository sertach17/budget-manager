<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Keep the demo in step with the site

Every change to the signed-in site must also be made in the public demo at `/demo`, in the same pull request. The demo uses only the made-up data in `src/lib/demo/data.ts`, never real accounts or transactions, and never reads or writes the database. Pages share their views (for example `src/app/budget/budget-view.tsx`), so the demo usually just renders the same view with demo data from `src/app/demo/demo-state.tsx`.

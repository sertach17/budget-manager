import "server-only";
import { z } from "zod";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { moveOwnBalance } from "@/lib/budget/apply-own-balance";
import { allGoalProgress } from "@/lib/budget/goals";
import { readGoal, type GoalInput } from "@/lib/budget/goal-input";
import { readManualTransaction } from "@/lib/budget/manual-transaction";
import { summarizeMonth } from "@/lib/budget/summary";
import type { TransactionRow } from "@/lib/budget/from-db";
import { easternToday } from "@/lib/dates";
import { statementFingerprints } from "@/lib/statements/parse";
import { isPlaidConfigured, plaidEnv } from "@/lib/plaid/client";
import { needsSignIn } from "@/lib/plaid/status";
import { syncBanks } from "@/lib/plaid/sync-all";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentSession, type AgentSession } from "./session";
import { describeTransaction, loadBudgetData, monthRange, ReadError, readRows, TRANSACTION_COLUMNS } from "./data";

// The tools a connected AI agent can call. Reads cover accounts,
// transactions, budgets, income, goals and Pending to review. Writes can
// change a transaction's category or goal, mark transactions reviewed, add a
// transaction, add or change a goal, and set a budget. It can also start a
// bank sync, at most every 30 minutes. Nothing deletes, and nothing touches
// bank links, settings or two-factor. The database enforces
// the same limits, so a tool can't do more than this even by mistake.
//
// Every write is logged to agent_activity for the Connected agents page.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (what: string) => z.string().regex(UUID, `Use the id of one of your ${what}.`);
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-11.")
  .describe("A month like 2026-11. Leave out for this month.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-16.");
const money = z.number().finite().nonnegative().lt(10_000_000);

class ToolError extends Error {}

type Ctx = { http?: { authInfo?: AuthInfo } };

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] };
}

// Runs a tool as the signed-in agent and turns problems into a plain message.
function tool<A>(fn: (args: A, s: AgentSession) => Promise<unknown>) {
  return async (args: A, ctx: Ctx) => {
    const auth = ctx.http?.authInfo;
    if (!auth) return { ...text({ error: "Sign in to Budget Manager first." }), isError: true };
    try {
      return text(await fn(args, agentSession(auth)));
    } catch (e) {
      if (e instanceof ToolError || e instanceof ReadError) return { ...text({ error: e.message }), isError: true };
      console.error("Agent tool failed:", e);
      return { ...text({ error: "Something went wrong. Try again." }), isError: true };
    }
  };
}

// Writes what an agent changed to your Connected agents page.
async function logChange(s: AgentSession, toolName: string, summary: string) {
  const { error } = await s.supabase
    .from("agent_activity")
    .insert({ user_id: s.userId, client_id: s.clientId, tool: toolName, summary: summary.slice(0, 300) });
  if (error) console.error("Logging an agent change failed:", error.message);
}

const thisMonth = () => easternToday().slice(0, 7);

const AGENT_SYNC_EVERY_MS = 30 * 60 * 1000;

const easternTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

// The day to count a month up to: today for this month, its last day before.
function countUpTo(m: string) {
  const today = easternToday();
  if (m > today.slice(0, 7)) throw new ToolError("That month hasn't started yet.");
  return m === today.slice(0, 7) ? today : monthRange(m).end;
}

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function oneOfYourCategories(s: AgentSession, categoryId: string) {
  const { data } = await s.supabase.from("categories").select("id, name").eq("id", categoryId).maybeSingle();
  if (!data) throw new ToolError("That category isn't one of yours. Call list_categories for the ids.");
  return data;
}

async function oneOfYourGoals(s: AgentSession, goalId: string) {
  const { data } = await s.supabase
    .from("goals")
    .select("id, name, target_amount, target_date, account_id, set_aside")
    .eq("id", goalId)
    .maybeSingle();
  if (!data) throw new ToolError("That goal isn't one of yours. Call list_goals for the ids.");
  return data;
}

// The goal form's checks, plus that its account is yours and holds money.
async function goalRow(s: AgentSession, input: GoalInput) {
  const fields = readGoal(input);
  if (typeof fields === "string") throw new ToolError(fields);
  if (fields.accountId) {
    if (!UUID.test(fields.accountId)) throw new ToolError("Use the id of one of your accounts.");
    const { data: account } = await s.supabase.from("accounts").select("id, type").eq("id", fields.accountId).maybeSingle();
    if (!account) throw new ToolError("That account isn't one of yours. Call list_accounts for the ids.");
    if (account.type === "credit" || account.type === "loan") throw new ToolError("Pick an account that holds money, not a card or loan.");
  }
  return {
    name: fields.name,
    target_amount: fields.target,
    target_date: fields.targetDate,
    account_id: fields.accountId,
    set_aside: fields.setAside,
  };
}

const goalFields = {
  name: z.string().min(1).max(60).describe("Like Nicaragua Trip."),
  target: money.positive().describe("How much to save, in dollars."),
  targetDate: day.nullable().optional().describe("The date to reach it by, or null for no date."),
  accountId: id("accounts").nullable().optional().describe("An account the goal follows, or null for none."),
  countsFrom: z
    .enum(["all", "part"])
    .optional()
    .describe('With an account: "all" counts its whole balance, "part" counts setAside.'),
  setAside: money
    .optional()
    .describe("With an account and countsFrom part: how much of its balance counts. With no account: what's already saved."),
};

export function registerAgentTools(server: McpServer) {
  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  server.registerTool(
    "list_accounts",
    {
      title: "List accounts",
      description:
        "Your accounts with their current balances, as your banks report them.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    tool(async (_args: Record<string, never>, s) => {
      const data = await loadBudgetData(s.supabase);
      return data.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        type: a.type,
        lastDigits: a.mask,
        balance: a.currentBalance,
      }));
    }),
  );

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description:
        "Your categories with their every-month budgets. kind is expense, income or transfer. Transfers and excluded categories don't count as spending.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    tool(async (_args: Record<string, never>, s) => {
      const [categories, budgets] = await Promise.all([
        s.supabase.from("categories").select("id, name, group_name, kind, is_excluded").order("name"),
        s.supabase.from("budgets").select("category_id, amount").is("month", null),
      ]);
      const budgetFor = new Map(readRows(budgets, "budgets").map((b) => [b.category_id, Number(b.amount)]));
      return readRows(categories, "categories").map((c) => ({
        id: c.id,
        name: c.name.trim(),
        group: c.group_name,
        kind: c.kind,
        excluded: c.is_excluded,
        monthlyBudget: budgetFor.get(c.id) ?? null,
      }));
    }),
  );

  server.registerTool(
    "search_transactions",
    {
      title: "Search transactions",
      description:
        "Finds transactions, newest first. Amounts below 0 are money out, above 0 money in. Without dates it looks at the last 90 days. A category id that starts with fallback: is your bank's category, not one of yours.",
      inputSchema: z.object({
        from: day.optional().describe("First date, like 2026-11-01."),
        to: day.optional().describe("Last date, like 2026-11-30."),
        text: z.string().max(60).optional().describe("Words in the description or merchant."),
        accountId: id("accounts").optional(),
        categoryId: z.string().max(80).optional().describe("A category id from list_categories, or a fallback: id."),
        goalId: id("goals").optional(),
        limit: z.number().int().min(1).max(200).optional().describe("How many to return, up to 200. Default 50."),
      }),
      annotations: READ,
    },
    tool(
      async (
        args: { from?: string; to?: string; text?: string; accountId?: string; categoryId?: string; goalId?: string; limit?: number },
        s,
      ) => {
        const today = easternToday();
        const to = args.to ?? today;
        let from = args.from;
        if (!from) {
          const d = new Date(`${to}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() - 90);
          from = d.toISOString().slice(0, 10);
        }
        if (from > to) throw new ToolError("from has to be on or before to.");

        let query = s.supabase
          .from("transactions")
          .select(TRANSACTION_COLUMNS)
          .gte("posted_on", from)
          .lte("posted_on", to)
          .order("posted_on", { ascending: false })
          .limit(5000);
        if (args.accountId) query = query.eq("account_id", args.accountId);
        if (args.goalId) query = query.eq("goal_id", args.goalId);
        const rows = readRows(await query, "transactions") as TransactionRow[];

        const data = await loadBudgetData(s.supabase, { transactions: rows, withGoals: true });
        const wanted = new Set(rows.map((r) => r.id));
        const words = args.text?.trim().toLowerCase();
        const found = data.transactions
          .filter((t) => wanted.has(t.id))
          .filter((t) => !args.categoryId || t.categoryId === args.categoryId)
          .filter((t) => !words || `${t.description} ${t.merchant ?? ""}`.toLowerCase().includes(words))
          .sort((a, b) => b.postedOn.localeCompare(a.postedOn));
        const limit = args.limit ?? 50;
        return {
          from,
          to,
          count: found.length,
          showing: Math.min(found.length, limit),
          transactions: found.slice(0, limit).map((t) => describeTransaction(t, data)),
        };
      },
    ),
  );

  server.registerTool(
    "get_budget_month",
    {
      title: "Get a month's budget",
      description:
        "Spending against your budgets for one month: income, spent, budgeted, and each category's spending, budget and what's left.",
      inputSchema: z.object({ month: month.optional() }),
      annotations: READ,
    },
    tool(async (args: { month?: string }, s) => {
      const m = args.month ?? thisMonth();
      const upTo = countUpTo(m);
      const data = await loadBudgetData(s.supabase, { month: m, withBudgets: true });
      const summary = summarizeMonth(data, upTo);
      const round = (n: number) => Math.round(n * 100) / 100;
      return {
        month: m,
        countedUpTo: upTo,
        daysLeft: summary.daysLeft,
        income: round(summary.income),
        spent: round(summary.spent),
        budgeted: round(summary.budgeted),
        categories: summary.byCategory.map((c) => ({
          id: c.category.id,
          name: c.category.name,
          spent: round(c.spent),
          budget: c.budget,
          left: c.budget === null ? null : round(c.budget - c.spent),
        })),
      };
    }),
  );

  server.registerTool(
    "get_income",
    {
      title: "Get a month's income",
      description: "Money that came in for one month, in your income categories, with each transaction.",
      inputSchema: z.object({ month: month.optional() }),
      annotations: READ,
    },
    tool(async (args: { month?: string }, s) => {
      const m = args.month ?? thisMonth();
      const data = await loadBudgetData(s.supabase, { month: m });
      const summary = summarizeMonth(data, countUpTo(m));
      return {
        month: m,
        total: Math.round(summary.income * 100) / 100,
        transactions: summary.incomeTransactions.map((t) => describeTransaction(t, data)),
      };
    }),
  );

  server.registerTool(
    "list_goals",
    {
      title: "List goals",
      description:
        "Your savings goals with progress: what's saved, what's left, and how much a month reaches the target by its date.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    tool(async (_args: Record<string, never>, s) => {
      const data = await loadBudgetData(s.supabase, { withGoals: true });
      return allGoalProgress(data, easternToday()).map((p) => ({
        id: p.goal.id,
        name: p.goal.name,
        target: p.goal.target,
        targetDate: p.goal.targetDate,
        account: p.account ? { id: p.account.id, name: p.account.name } : null,
        countsFrom: p.goal.accountId ? (p.goal.setAside === null ? "all" : "part") : null,
        setAside: p.goal.setAside,
        saved: p.saved,
        fromAccount: p.fromAccount,
        fromTaggedTransactions: p.tagged,
        taggedCount: p.taggedCount,
        left: p.left,
        percent: Math.round(p.percent),
        monthsLeft: p.monthsLeft,
        perMonth: p.perMonth,
        pastDate: p.pastDate,
        accountShortBy: p.shortBy,
      }));
    }),
  );

  server.registerTool(
    "list_pending_review",
    {
      title: "List Pending to review",
      description: "Transactions waiting under Pending to review, newest first, up to 200.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    tool(async (_args: Record<string, never>, s) => {
      const rows = readRows(
        await s.supabase
          .from("transactions")
          .select(TRANSACTION_COLUMNS)
          .is("reviewed_at", null)
          .order("posted_on", { ascending: false })
          .limit(200),
        "transactions",
      ) as TransactionRow[];
      const data = await loadBudgetData(s.supabase, { transactions: rows, withGoals: true });
      const wanted = new Set(rows.map((r) => r.id));
      const found = data.transactions.filter((t) => wanted.has(t.id)).sort((a, b) => b.postedOn.localeCompare(a.postedOn));
      return { count: found.length, transactions: found.map((t) => describeTransaction(t, data)) };
    }),
  );

  // ---------------------------------------------------------------------------
  // Changing
  // ---------------------------------------------------------------------------

  server.registerTool(
    "set_transaction_category",
    {
      title: "Change a transaction's category",
      description:
        "Puts a transaction in one of your categories. Use null to send it back to your bank's category.",
      inputSchema: z.object({ transactionId: id("transactions"), categoryId: id("categories").nullable() }),
      annotations: WRITE,
    },
    tool(async (args: { transactionId: string; categoryId: string | null }, s) => {
      const category = args.categoryId ? await oneOfYourCategories(s, args.categoryId) : null;
      const { data, error } = await s.supabase
        .from("transactions")
        .update({ category_id: category?.id ?? null })
        .eq("id", args.transactionId)
        .select("id, description, merchant, amount, posted_on");
      if (error) console.error("Agent category change failed:", error.message);
      if (error || !data?.length) throw new ToolError("Couldn't change it. Check the transaction id.");
      const t = data[0];
      const what = `${t.merchant || t.description} (${usd(Number(t.amount))}, ${t.posted_on})`;
      const to = category ? category.name.trim() : "your bank's category";
      await logChange(s, "set_transaction_category", `Moved ${what} to ${to}.`);
      return { ok: true, message: `Moved ${what} to ${to}.` };
    }),
  );

  server.registerTool(
    "set_transaction_goal",
    {
      title: "Tag a transaction to a goal",
      description:
        "Tags a transaction to one of your goals, or takes the tag off with null. It keeps its category. Money in adds to the goal, money out takes from it.",
      inputSchema: z.object({ transactionId: id("transactions"), goalId: id("goals").nullable() }),
      annotations: WRITE,
    },
    tool(async (args: { transactionId: string; goalId: string | null }, s) => {
      const goal = args.goalId ? await oneOfYourGoals(s, args.goalId) : null;
      const { data, error } = await s.supabase
        .from("transactions")
        .update({ goal_id: goal?.id ?? null })
        .eq("id", args.transactionId)
        .select("id, description, merchant, amount, posted_on");
      if (error) console.error("Agent goal tag failed:", error.message);
      if (error || !data?.length) throw new ToolError("Couldn't change it. Check the transaction id.");
      const t = data[0];
      const what = `${t.merchant || t.description} (${usd(Number(t.amount))}, ${t.posted_on})`;
      const message = goal ? `Tagged ${what} to ${goal.name}.` : `Took the goal off ${what}.`;
      await logChange(s, "set_transaction_goal", message);
      return { ok: true, message };
    }),
  );

  server.registerTool(
    "mark_reviewed",
    {
      title: "Mark transactions reviewed",
      description: "Takes transactions off Pending to review. Up to 200 at once.",
      inputSchema: z.object({ transactionIds: z.array(id("transactions")).min(1).max(200) }),
      annotations: WRITE,
    },
    tool(async (args: { transactionIds: string[] }, s) => {
      const ids = [...new Set(args.transactionIds)];
      const { data, error } = await s.supabase
        .from("transactions")
        .update({ reviewed_at: new Date().toISOString() })
        .in("id", ids)
        .is("reviewed_at", null)
        .select("id");
      if (error) {
        console.error("Agent mark reviewed failed:", error.message);
        throw new ToolError("Couldn't mark them reviewed. Try again.");
      }
      const count = data?.length ?? 0;
      if (count) await logChange(s, "mark_reviewed", `Marked ${count} transaction${count === 1 ? "" : "s"} reviewed.`);
      return { ok: true, marked: count, alreadyReviewedOrNotFound: ids.length - count };
    }),
  );

  server.registerTool(
    "add_transaction",
    {
      title: "Add a transaction",
      description:
        "Adds a transaction to one of your accounts, as if you typed it in. On an account you keep yourself (not a linked bank), the balance moves with it.",
      inputSchema: z.object({
        accountId: id("accounts"),
        date: day.describe("When it happened, like 2026-11-16. Not in the future."),
        description: z.string().min(1).max(200).describe("What it was, like Corner Store."),
        amount: money.positive().describe("How much, in dollars, always positive."),
        direction: z.enum(["out", "in"]).describe('"out" for money spent, "in" for money received.'),
        categoryId: id("categories").optional(),
      }),
      annotations: { ...WRITE, idempotentHint: false },
    },
    tool(
      async (
        args: { accountId: string; date: string; description: string; amount: number; direction: "out" | "in"; categoryId?: string },
        s,
      ) => {
        const row = readManualTransaction(
          {
            postedOn: args.date,
            description: args.description,
            amount: String(args.amount),
            direction: args.direction,
            categoryId: args.categoryId ?? "",
          },
          easternToday(),
        );
        if (typeof row === "string") throw new ToolError(row);
        const { data: account } = await s.supabase.from("accounts").select("id, name").eq("id", args.accountId).maybeSingle();
        if (!account) throw new ToolError("That account isn't one of yours. Call list_accounts for the ids.");
        if (args.categoryId) await oneOfYourCategories(s, args.categoryId);

        // Same fingerprint an upload gives it, so a statement uploaded later
        // skips it instead of adding it twice.
        const [first] = statementFingerprints(account.id, [row]);
        let added: string | null = null;
        for (let n = 1; n <= 20 && !added; n++) {
          const { data, error } = await s.supabase
            .from("transactions")
            .insert({
              user_id: s.userId,
              account_id: account.id,
              category_id: args.categoryId ?? null,
              posted_on: row.postedOn,
              description: row.description,
              amount: row.amount,
              pending: false,
              source: "manual",
              fingerprint: n === 1 ? first : `${first}:${n}`,
              // An agent's entry waits under Pending to review, so you see it.
              reviewed_at: null,
            })
            .select("id")
            .single();
          if (data) added = data.id;
          else if (error?.code !== "23505" || n === 20) {
            if (error) console.error("Agent add transaction failed:", error.message);
            throw new ToolError("Couldn't add it. Try again.");
          }
        }

        await moveOwnBalance(s.supabase, account.id, [row]);
        const message = `Added ${row.description} (${row.amount < 0 ? "-" : "+"}${usd(row.amount)}, ${row.postedOn}) to ${account.name}.`;
        await logChange(s, "add_transaction", message);
        return { ok: true, id: added, message, note: "It waits under Pending to review until you mark it reviewed." };
      },
    ),
  );

  server.registerTool(
    "create_goal",
    {
      title: "Add a goal",
      description: "Adds a savings goal.",
      inputSchema: z.object(goalFields),
      annotations: { ...WRITE, idempotentHint: false },
    },
    tool(
      async (
        args: { name: string; target: number; targetDate?: string | null; accountId?: string | null; countsFrom?: "all" | "part"; setAside?: number },
        s,
      ) => {
        const row = await goalRow(s, {
          name: args.name,
          target: String(args.target),
          targetDate: args.targetDate ?? "",
          accountId: args.accountId ?? "",
          from: args.countsFrom ?? (args.setAside === undefined ? "all" : "part"),
          amount: args.setAside === undefined ? "" : String(args.setAside),
        });
        const { data, error } = await s.supabase.from("goals").insert(row).select("id").single();
        if (error || !data) {
          if (error) console.error("Agent add goal failed:", error.message);
          throw new ToolError("Couldn't add the goal. Try again.");
        }
        const message = `Added the goal ${row.name}, ${usd(row.target_amount)}${row.target_date ? ` by ${row.target_date}` : ""}.`;
        await logChange(s, "create_goal", message);
        return { ok: true, id: data.id, message };
      },
    ),
  );

  server.registerTool(
    "update_goal",
    {
      title: "Change a goal",
      description: "Changes a goal. Only the fields you send change.",
      inputSchema: z.object({ goalId: id("goals"), ...goalFields, name: goalFields.name.optional(), target: goalFields.target.optional() }),
      annotations: WRITE,
    },
    tool(
      async (
        args: {
          goalId: string;
          name?: string;
          target?: number;
          targetDate?: string | null;
          accountId?: string | null;
          countsFrom?: "all" | "part";
          setAside?: number;
        },
        s,
      ) => {
        const goal = await oneOfYourGoals(s, args.goalId);
        const accountId = args.accountId === undefined ? goal.account_id : args.accountId;
        const setAside = args.setAside ?? (goal.set_aside === null ? undefined : Number(goal.set_aside));
        // Keeps how it counted the account unless you say otherwise.
        const from = args.countsFrom ?? (args.setAside !== undefined || goal.set_aside !== null ? "part" : "all");
        const row = await goalRow(s, {
          name: args.name ?? goal.name,
          target: String(args.target ?? goal.target_amount),
          targetDate: (args.targetDate === undefined ? goal.target_date : args.targetDate) ?? "",
          accountId: accountId ?? "",
          from,
          amount: setAside === undefined ? "" : String(setAside),
        });
        const { data, error } = await s.supabase.from("goals").update(row).eq("id", goal.id).select("id");
        if (error || !data?.length) {
          if (error) console.error("Agent goal change failed:", error.message);
          throw new ToolError("Couldn't save the goal. Try again.");
        }
        const message = `Changed the goal ${row.name}.`;
        await logChange(s, "update_goal", message);
        return { ok: true, message };
      },
    ),
  );

  server.registerTool(
    "set_budget",
    {
      title: "Set a budget",
      description:
        "Sets how much you plan to spend in a category each month, or just in one month when you give one. A month's budget wins over the every-month one.",
      inputSchema: z.object({
        categoryId: id("categories"),
        amount: money.describe("Dollars a month."),
        month: month.optional().describe("Just this month, like 2026-12. Leave out for every month."),
      }),
      annotations: WRITE,
    },
    tool(async (args: { categoryId: string; amount: number; month?: string }, s) => {
      const category = await oneOfYourCategories(s, args.categoryId);
      const amount = Math.round(args.amount * 100) / 100;
      const monthStart = args.month ? `${args.month}-01` : null;
      let existing = s.supabase.from("budgets").select("id").eq("category_id", category.id);
      existing = monthStart ? existing.eq("month", monthStart) : existing.is("month", null);
      const { data: found } = await existing.maybeSingle();
      const { error } = found
        ? await s.supabase.from("budgets").update({ amount }).eq("id", found.id)
        : await s.supabase.from("budgets").insert({ category_id: category.id, amount, month: monthStart });
      if (error) {
        console.error("Agent budget change failed:", error.message);
        throw new ToolError("Couldn't save the budget. Try again.");
      }
      const message = `Set ${category.name.trim()} to ${usd(amount)} ${args.month ? `for ${args.month}` : "every month"}.`;
      await logChange(s, "set_budget", message);
      return { ok: true, message };
    }),
  );

  // ---------------------------------------------------------------------------
  // Syncing
  // ---------------------------------------------------------------------------

  server.registerTool(
    "sync_banks",
    {
      title: "Sync your banks",
      description:
        "Pulls the latest transactions and balances from your connected banks (not Venmo or uploads), the same as Sync now. At most once every 30 minutes; banks also sync by themselves every morning around 6 AM.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    tool(async (_args: Record<string, never>, s) => {
      if (!isPlaidConfigured()) throw new ToolError("No banks are connected on this site.");
      const admin = createAdminClient();
      const [{ data: lastAgentSync, error: activityError }, { data: items, error: itemsError }] = await Promise.all([
        s.supabase
          .from("agent_activity")
          .select("created_at")
          .eq("tool", "sync_banks")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin.from("plaid_items").select("last_synced_at").eq("user_id", s.userId).eq("environment", plaidEnv()),
      ]);
      if (activityError || itemsError) throw new ReadError("Couldn't check when your banks last synced. Try again.");
      if (!items?.length) throw new ToolError("No banks are connected yet.");

      // Counts your own syncs and the morning one too, so banks aren't asked
      // more than once every 30 minutes because of an agent.
      const last = Math.max(
        lastAgentSync ? new Date(lastAgentSync.created_at).getTime() : 0,
        ...items.map((i) => (i.last_synced_at ? new Date(i.last_synced_at).getTime() : 0)),
      );
      const nextAllowed = last + AGENT_SYNC_EVERY_MS;
      if (Date.now() < nextAllowed) {
        const minutes = Math.max(1, Math.round((Date.now() - last) / 60_000));
        return {
          synced: false,
          message: `Your banks synced ${minutes} minute${minutes === 1 ? "" : "s"} ago, so the data is fresh. An agent can start another sync after ${easternTime(nextAllowed)}.`,
        };
      }

      await logChange(s, "sync_banks", "Started a bank sync.");
      const results = await syncBanks(admin, s.userId);
      return {
        synced: true,
        banks: results.map((r) =>
          r.ok
            ? { bank: r.bank, ok: true, newOrUpdated: r.added, removed: r.removed }
            : {
                bank: r.bank,
                ok: false,
                problem: needsSignIn(r.code ?? null)
                  ? "Needs you to sign in again on the Banks page."
                  : `Sync didn't work (${r.code}).`,
              },
        ),
      };
    }),
  );
}

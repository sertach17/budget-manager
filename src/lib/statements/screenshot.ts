import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { categoryCode, readDate, type StatementRow } from "./parse";

// Reads a screenshot of transactions (like the Apple Card list in Wallet)
// with Claude Haiku 5.5, Anthropic's lowest-cost model. Needs
// ANTHROPIC_API_KEY on the server; the image isn't kept here after it's read.

const MODEL = "claude-haiku-5-5";

const CATEGORIES = [
  "Restaurants",
  "Grocery",
  "Gas",
  "Shopping",
  "Entertainment",
  "Transportation",
  "Travel",
  "Medical",
  "Utilities",
  "Payment",
  "Interest",
  "Other",
] as const;

const Reading = z.object({
  // False when the picture doesn't show a list of transactions.
  shows_transactions: z.boolean(),
  transactions: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      merchant: z.string(),
      amount: z.number().describe("Money out is negative, money in is positive"),
      category: z.enum(CATEGORIES),
      pending: z.boolean(),
    }),
  ),
});

export type ScreenshotResult = { ok: true; rows: StatementRow[]; pendingLeftOut: number } | { ok: false; message: string };

export const isScreenshotReadingSetUp = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function readTransactionScreenshot(input: {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  accountType: string;
  today: string; // YYYY-MM-DD, Eastern time
}): Promise<ScreenshotResult> {
  if (!isScreenshotReadingSetUp()) {
    return { ok: false, message: "Screenshot reading isn't set up yet. Add ANTHROPIC_API_KEY in Vercel." };
  }
  const card = input.accountType === "credit" || input.accountType === "loan";
  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(Reading) },
      system: [
        "You read screenshots of bank, card and wallet apps and list the transactions they show.",
        `Today is ${input.today}. Turn relative dates like "Yesterday", "Friday" or "Nov 3" into YYYY-MM-DD, always on or before today; a date without a year is the most recent one.`,
        `This is a ${card ? "credit card or loan" : input.accountType} account. Write money out (purchases, fees, interest) as a negative amount and money in (payments to the card, refunds, deposits) as a positive amount, whatever signs the app shows.`,
        "Give each transaction's merchant or name as the app shows it, without extra details like a city. Use Payment for a payment toward the card, Interest for interest charges, and Other when unsure.",
        "List only what is clearly visible. Skip any row cut off at the edge of the picture, and section headers or totals. Mark rows the app labels as pending.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } },
            { type: "text", text: "List the transactions in this screenshot." },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: "The Anthropic API key in Vercel isn't working. Check it." };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, message: "Too many screenshots at once. Wait a minute and try again." };
    if (error instanceof Anthropic.APIError && error.status === 400 && /credit/i.test(error.message)) {
      return { ok: false, message: "Your Anthropic account is out of credit. Add some in its billing page." };
    }
    return { ok: false, message: "The screenshot couldn't be read right now. Try again in a minute." };
  }

  if (response.stop_reason === "refusal") return { ok: false, message: "This screenshot couldn't be read. Try a different one." };
  if (response.stop_reason === "max_tokens") return { ok: false, message: "This screenshot has too many rows. Try a shorter one." };
  const reading = response.parsed_output;
  if (!reading || !reading.shows_transactions) return { ok: false, message: "No transactions were found in this picture." };

  const rows: StatementRow[] = [];
  let pendingLeftOut = 0;
  for (const t of reading.transactions) {
    // Pending rows can still change, so they wait for a later screenshot.
    if (t.pending) {
      pendingLeftOut++;
      continue;
    }
    const postedOn = readDate(t.date);
    const merchant = t.merchant.replace(/\s+/g, " ").trim().slice(0, 200);
    const amount = Math.round(t.amount * 100) / 100;
    if (!postedOn || postedOn > input.today || !merchant || !Number.isFinite(amount) || Math.abs(amount) >= 10_000_000) continue;
    rows.push({ postedOn, description: merchant, merchant, amount, category: categoryCode(t.category) });
  }
  if (!rows.length && !pendingLeftOut) return { ok: false, message: "No transactions were found in this picture." };
  return { ok: true, rows, pendingLeftOut };
}

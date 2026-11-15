// Turns one Venmo notification email into what it means for your Venmo
// balance. Pure functions only (no database, no network), so they can be
// tested on real email text.
//
// What Venmo emails look like (checked against real ones, Nov 2026):
//   Subject "You paid Teresa Castellon $17.60"
//     Body has "Payment Method Venmo balance" or a bank account.
//   Subject "Teresa Castellon paid you $380.00"
//   Subject "Teresa Castellon paid your $49.21 request"
//   Subject "Teresa Castellon paid $12.22 to your Venmo account. Leave it..."
//   Subject "Your Venmo Standard transfer has been initiated"
//     Body has "Transfer Amount $214.98" and "Destination Jpmorgan Chase Bank".
// Venmo's preview text sometimes says the opposite direction ("You paid X"
// on money you received), so the subject decides the direction, never the
// preview.

export type VenmoEvent =
  | {
      kind: "payment";
      // Money in or out of the Venmo balance. Negative = money out.
      amount: number;
      counterparty: string;
      memo: string | null;
      postedOn: string; // YYYY-MM-DD
      venmoId: string;
    }
  | {
      kind: "transfer";
      amount: number; // always negative: money leaving Venmo for a bank
      destination: string | null;
      postedOn: string;
      venmoId: string;
    }
  | {
      // You paid someone, but from a bank account or card, not the Venmo
      // balance. That money already shows in the bank's own transactions.
      kind: "paid_from_bank";
      amount: number;
      counterparty: string;
      fundedBy: string;
    }
  | { kind: "ignored"; reason: string };

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·",
};

// HTML (or markdown-ish text) down to one line of plain words.
export function toPlainText(input: string) {
  return input
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\[\]\([^)]*\)/g, " ") // markdown links with no text
    .replace(/[|#*_]+/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMoney(text: string) {
  const value = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(value) && value > 0 && value < 1_000_000 ? Math.round(value * 100) / 100 : null;
}

// "Nov 14, 2026", "November 10, 2026" or "Tuesday, November 10, 2026".
export function parseDate(text: string) {
  const m = text.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})\b/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

// The calendar day in New York for when the email arrived, as a fallback.
export function newYorkDay(at: Date) {
  return at.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function clean(text: string, max = 200) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function field(body: string, label: string, next: string[]) {
  const stop = next.map((n) => n.replace(/ /g, "\\s+")).join("|");
  const re = new RegExp(`${label.replace(/ /g, "\\s+")}\\s+(.+?)\\s+(?:${stop}|$)`, "i");
  return body.match(re)?.[1]?.trim() ?? null;
}

const DETAIL_LABELS = [
  "Date", "Status", "Transaction ID", "Payment Method", "Sent from", "Sent to", "For any issues",
  "Money credited", "Transaction details", "Like", "Comment",
];

export function parseVenmoEmail(input: { subject: string; text: string; receivedAt: Date }): VenmoEvent {
  const subject = clean(input.subject, 300);
  const body = toPlainText(input.text);
  const fallbackDay = newYorkDay(input.receivedAt);

  // Transfers out to a bank.
  if (/^Your Venmo (Standard|Instant) transfer has been initiated/i.test(subject)) {
    const amount = parseMoney(field(body, "Transfer Amount", ["Transfer transaction ID", "Fee", "Estimated arrival", "Destination"]) ?? "");
    const venmoId = body.match(/Transfer transaction ID\s+([A-Za-z0-9-]{4,40})/i)?.[1];
    if (!amount || !venmoId) return { kind: "ignored", reason: "Transfer email without an amount or ID" };
    const initiated = body.match(/Initiated on\s+([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
    const destination = field(body, "Destination", ["You can see", "Bank transfers", "IMPORTANT"]);
    return {
      kind: "transfer",
      amount: -amount,
      destination: destination ? clean(destination.replace(/[·•.]{2,}\s*\d{2,4}$/, ""), 100) : null,
      postedOn: (initiated && parseDate(initiated)) || fallbackDay,
      venmoId,
    };
  }

  let direction: "in" | "out" | null = null;
  let counterparty: string | null = null;
  let amountText: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = subject.match(/^You paid (.+?) \$([\d,]+\.\d{2})$/i))) {
    direction = "out";
    [, counterparty, amountText] = m;
  } else if ((m = subject.match(/^(.+?) paid your \$([\d,]+\.\d{2}) request$/i))) {
    direction = "in";
    [, counterparty, amountText] = m;
  } else if ((m = subject.match(/^(.+?) paid you \$([\d,]+\.\d{2})!?$/i))) {
    direction = "in";
    [, counterparty, amountText] = m;
  } else if ((m = subject.match(/^(.+?) paid \$([\d,]+\.\d{2}) to your Venmo account\b/i))) {
    direction = "in";
    [, counterparty, amountText] = m;
  }

  if (!direction || !counterparty || !amountText) {
    return { kind: "ignored", reason: "Not a payment or transfer email" };
  }
  const amount = parseMoney(amountText);
  if (!amount) return { kind: "ignored", reason: "Payment email without a readable amount" };
  const name = clean(counterparty, 100);

  if (direction === "out") {
    const method = field(body, "Payment Method", DETAIL_LABELS);
    if (!method) return { kind: "ignored", reason: "Payment email without a payment method" };
    if (!/^Venmo balance$/i.test(method.trim())) {
      return { kind: "paid_from_bank", amount: -amount, counterparty: name, fundedBy: clean(method, 100) };
    }
  }

  const venmoId = body.match(/Transaction ID\s+([A-Za-z0-9]{6,40})\b/i)?.[1];
  if (!venmoId) return { kind: "ignored", reason: "Payment email without a transaction ID" };
  const dateText = field(body, "Date", DETAIL_LABELS);

  // The memo sits between the amount ("$ 17. 60") and "See transaction".
  // Take the last amount before it, since the preview line repeats the amount.
  const memoMatch = body.match(/\$\s*[\d,]+\s*\.\s*\d{2}\s+((?:(?!\$\s*\d).)*?)\s*See transaction/i);
  const memo = memoMatch ? clean(memoMatch[1], 200) || null : null;

  return {
    kind: "payment",
    amount: direction === "out" ? -amount : amount,
    counterparty: name,
    memo,
    postedOn: (dateText && parseDate(dateText)) || fallbackDay,
    venmoId,
  };
}

// The Gmail forwarding confirmation code, from Google's confirmation email.
export function parseGmailConfirmation(input: { subject: string; text: string }) {
  const body = toPlainText(input.text);
  const code = body.match(/Confirmation code:?\s*(\d{6,12})/i)?.[1] ?? input.subject.match(/#(\d{6,12})/)?.[1];
  return code ?? null;
}

// Reads a statement file you download from a bank or card (CSV, OFX, QFX or
// QBO) into transactions. It runs in the browser, so the file itself is never
// sent anywhere: only the rows you choose to save are.
//
// Money convention: amount < 0 is money out, amount > 0 is money in.

export type StatementRow = {
  postedOn: string; // YYYY-MM-DD
  description: string;
  merchant: string | null;
  amount: number;
  // A bank-style category code, like FOOD_AND_DRINK_RESTAURANT, so your
  // categories pick these rows up the same way they pick up bank rows.
  category: string | null;
};

export type StatementFormat = "apple-card" | "csv" | "ofx" | "screenshot";

export type ParsedStatement = {
  format: StatementFormat;
  rows: StatementRow[];
  // Lines that looked like transactions but couldn't be read.
  skipped: number;
  // Only for a plain CSV with one amount column: whether money out showed as
  // a positive number, so the amounts were flipped. You can change it.
  flipped: boolean | null;
};

export type ParseOptions = {
  // Turn every amount around (plain CSV only). Left out, it's guessed.
  flip?: boolean;
  // The account's kind; card files often show purchases as positive.
  accountType?: string;
};

export const MAX_ROWS = 5000;

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

// A CSV reader that handles quotes, commas inside quotes and "" escapes.
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > days ? null : `${y}-${pad(m)}-${pad(d)}`;
}

// 11/03/2026, 11/3/26, 2026-11-03 or 20261103.
export function readDate(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validDate(year, +m[1], +m[2]);
  }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
}

// $1,234.56, -12.30, (12.30) and 12.30 CR style numbers. Null if it isn't one.
export function readAmount(value: string): number | null {
  let v = value.trim().replace(/[$\s]|USD/gi, "").replace(/,/g, "");
  if (!v) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) {
    sign = -1;
    v = v.slice(1, -1);
  }
  if (/CR$/i.test(v)) v = v.slice(0, -2);
  else if (/DR$/i.test(v)) {
    sign = -sign;
    v = v.slice(0, -2);
  }
  if (!/^[-+]?\d*\.?\d+$/.test(v)) return null;
  const n = Number(v) * sign;
  if (!Number.isFinite(n) || Math.abs(n) >= 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

const tidy = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Categories in card and bank files, as bank-style codes
// ---------------------------------------------------------------------------

const CATEGORY_WORDS: [RegExp, string][] = [
  [/^payments?$|payment.*credit card|^autopay/, "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"],
  [/restaurant|dining|food ?(&|and) ?drink/, "FOOD_AND_DRINK_RESTAURANT"],
  [/grocer/, "FOOD_AND_DRINK_GROCERIES"],
  [/alcohol|liquor|\bbars?\b/, "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR"],
  [/^gas|fuel/, "TRANSPORTATION_GAS"],
  [/airline|flight/, "TRAVEL_FLIGHTS"],
  [/hotel|lodging/, "TRAVEL_LODGING"],
  [/car rental/, "TRAVEL_RENTAL_CARS"],
  [/travel/, "TRAVEL"],
  [/transport|parking|tolls?|automotive/, "TRANSPORTATION"],
  [/medical|health|pharmacy/, "MEDICAL"],
  [/utilit|bills?/, "RENT_AND_UTILITIES"],
  [/insurance/, "GENERAL_SERVICES_INSURANCE"],
  [/entertainment/, "ENTERTAINMENT"],
  [/personal care|beauty/, "PERSONAL_CARE"],
  [/home|hardware/, "HOME_IMPROVEMENT"],
  [/shopping|merchandise/, "GENERAL_MERCHANDISE"],
  [/interest/, "BANK_FEES_INTEREST_CHARGE"],
  [/fee/, "BANK_FEES"],
  [/gift|donation|charity|government/, "GOVERNMENT_AND_NON_PROFIT"],
  [/service/, "GENERAL_SERVICES"],
];

export function categoryCode(label: string): string | null {
  const v = label.trim().toLowerCase();
  if (!v || v === "other") return null;
  return CATEGORY_WORDS.find(([pattern]) => pattern.test(v))?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// OFX, QFX and QBO
// ---------------------------------------------------------------------------

function ofxValue(block: string, tag: string) {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : "";
}

const decodeEntities = (value: string) =>
  value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function parseOfx(text: string): ParsedStatement {
  const rows: StatementRow[] = [];
  let skipped = 0;
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const postedOn = readDate(ofxValue(block, "DTPOSTED"));
    // OFX already signs amounts the right way, cards included.
    const amount = readAmount(ofxValue(block, "TRNAMT"));
    const name = decodeEntities(ofxValue(block, "NAME"));
    const memo = decodeEntities(ofxValue(block, "MEMO"));
    const description = tidy(name || memo, 200);
    if (!postedOn || amount === null || !description) {
      skipped++;
      continue;
    }
    const type = ofxValue(block, "TRNTYPE").toUpperCase();
    rows.push({
      postedOn,
      description,
      merchant: null,
      amount,
      category: type === "INT" ? "BANK_FEES_INTEREST_CHARGE" : type === "FEE" || type === "SRVCHG" ? "BANK_FEES" : null,
    });
  }
  return { format: "ofx", rows, skipped, flipped: null };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, " ").trim();

function findColumn(header: string[], ...patterns: RegExp[]) {
  for (const pattern of patterns) {
    const i = header.findIndex((h) => pattern.test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

type Columns = {
  date: number;
  description: number;
  merchant: number;
  category: number;
  amount: number;
  out: number; // debit / withdrawal column, money out
  in: number; // credit / deposit column, money in
  type: number;
};

function columnsFrom(header: string[]): Columns | null {
  const date = findColumn(header, /^transaction date$/, /^(trans|txn) date$/, /^date$/, /^posting date$/, /^posted date$/, /date/);
  const description = findColumn(header, /^description$/, /^payee$/, /^name$/, /^details$/, /^memo$/, /description|payee|narrative/);
  const merchant = findColumn(header, /^merchant$/, /^merchant name$/);
  const amount = findColumn(header, /^amount( usd)?$/, /^transaction amount$/, /^amount/);
  const out = findColumn(header, /^debit( amount)?$/, /^withdrawals?( amount)?$/, /^money out$/, /^paid out$/);
  const inCol = findColumn(header, /^credit( amount)?$/, /^deposits?( amount)?$/, /^money in$/, /^paid in$/);
  const desc = description >= 0 ? description : merchant;
  if (date < 0 || desc < 0) return null;
  if (amount < 0 && out < 0 && inCol < 0) return null;
  return {
    date,
    description: desc,
    merchant: description >= 0 ? merchant : -1,
    category: findColumn(header, /^category$/, /category/),
    amount,
    out,
    in: inCol,
    type: findColumn(header, /^type$/, /^transaction type$/),
  };
}

// A file with no header row, like some Wells Fargo downloads: pick the first
// date column, the first number column and the longest text column.
function columnsByContent(rows: string[][]): Columns | null {
  const sample = rows.slice(0, 20);
  const width = Math.max(...sample.map((r) => r.length));
  const share = (test: (v: string) => boolean, col: number) =>
    sample.filter((r) => r[col] !== undefined && test(r[col])).length / sample.length;
  let date = -1;
  let amount = -1;
  let description = -1;
  let longest = 0;
  for (let col = 0; col < width; col++) {
    if (date < 0 && share((v) => readDate(v) !== null, col) > 0.8) {
      date = col;
      continue;
    }
    if (amount < 0 && share((v) => readAmount(v) !== null, col) > 0.8) {
      amount = col;
      continue;
    }
    const text = sample.reduce((n, r) => n + (r[col] && /[a-z]/i.test(r[col]) ? r[col].length : 0), 0);
    if (text > longest) {
      longest = text;
      description = col;
    }
  }
  if (date < 0 || amount < 0 || description < 0) return null;
  return { date, description, merchant: -1, category: -1, amount, out: -1, in: -1, type: -1 };
}

function isAppleCard(header: string[]) {
  const h = header.map(norm);
  return h.includes("clearing date") && h.includes("merchant") && h.some((x) => x.startsWith("amount")) && h.includes("purchased by");
}

function parseCsv(text: string, options: ParseOptions): ParsedStatement {
  const all = readCsv(text);
  // Some banks put a few lines before the header, so look a little way down.
  let headerAt = -1;
  let columns: Columns | null = null;
  for (let i = 0; i < Math.min(all.length, 15); i++) {
    columns = columnsFrom(all[i]);
    if (columns) {
      headerAt = i;
      break;
    }
  }
  const apple = headerAt >= 0 && isAppleCard(all[headerAt]);
  let body = all.slice(headerAt + 1);
  if (!columns) {
    columns = columnsByContent(all);
    body = all;
    if (!columns) throw new Error("This file doesn't look like a statement. It needs a date, a description and an amount column.");
  }
  const c = columns;

  type Raw = { postedOn: string; description: string; merchant: string | null; amount: number; category: string | null; single: boolean };
  const raws: Raw[] = [];
  let skipped = 0;
  for (const r of body) {
    const postedOn = readDate(r[c.date] ?? "");
    const description = tidy(r[c.description] ?? "", 200);
    const merchant = c.merchant >= 0 ? tidy(r[c.merchant] ?? "", 200) || null : null;
    let amount: number | null = null;
    let single = false;
    if (c.out >= 0 || c.in >= 0) {
      const out = c.out >= 0 ? readAmount(r[c.out] ?? "") : null;
      const inn = c.in >= 0 ? readAmount(r[c.in] ?? "") : null;
      if (out !== null && out !== 0) amount = -Math.abs(out);
      else if (inn !== null && inn !== 0) amount = Math.abs(inn);
      else if (c.amount >= 0) {
        amount = readAmount(r[c.amount] ?? "");
        single = true;
      } else if (out === 0 || inn === 0) amount = 0;
    } else {
      amount = readAmount(r[c.amount] ?? "");
      single = true;
    }
    if (!postedOn || amount === null || (!description && !merchant)) {
      skipped++;
      continue;
    }
    const typeLabel = c.type >= 0 ? r[c.type] ?? "" : "";
    const categoryLabel = c.category >= 0 ? r[c.category] ?? "" : "";
    const category = /^payment$/i.test(typeLabel.trim()) ? categoryCode("payment") : categoryCode(categoryLabel);
    raws.push({ postedOn, description: description || merchant!, merchant, amount, category, single });
  }

  // Apple Card shows purchases as positive and payments as negative, so its
  // amounts always flip. A plain CSV with one amount column flips when you
  // say so, or when it's a card or loan file where most amounts are positive.
  let flipped: boolean | null = null;
  if (apple) flipped = true;
  else if (raws.some((r) => r.single)) {
    if (options.flip !== undefined) flipped = options.flip;
    else {
      const card = options.accountType === "credit" || options.accountType === "loan";
      const positive = raws.filter((r) => r.single && r.amount > 0).length;
      const negative = raws.filter((r) => r.single && r.amount < 0).length;
      flipped = card && positive > negative;
    }
  }
  const rows = raws.map(({ single, ...r }) => ({
    ...r,
    amount: (apple || (single && flipped)) && r.amount !== 0 ? -r.amount : r.amount,
  }));
  return { format: apple ? "apple-card" : "csv", rows, skipped, flipped: apple ? null : flipped };
}

// ---------------------------------------------------------------------------

export function parseStatement(fileName: string, text: string, options: ParseOptions = {}): ParsedStatement {
  const looksOfx = /\.(ofx|qfx|qbo)$/i.test(fileName) || /<OFX>/i.test(text.slice(0, 5000));
  const parsed = looksOfx ? parseOfx(text) : parseCsv(text, options);
  if (!parsed.rows.length) throw new Error("No transactions were found in this file.");
  if (parsed.rows.length > MAX_ROWS) throw new Error(`This file has more than ${MAX_ROWS} transactions. Split it into smaller date ranges.`);
  return parsed;
}

// The same transaction always gets the same fingerprint, so uploading two
// statements that overlap doesn't add anything twice. It uses the merchant
// name when there is one, so an Apple Card export and a screenshot of the
// same purchase match. Two identical rows in one file (two $4.50 coffees on
// the same day) are told apart by a count.
export function statementFingerprints(
  accountId: string,
  rows: (Pick<StatementRow, "postedOn" | "amount" | "description"> & { merchant?: string | null })[],
) {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const cleaned = (r.merchant || r.description).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const key = `upload:${accountId}:${r.postedOn}:${r.amount.toFixed(2)}:${cleaned}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}:${n}`;
  });
}

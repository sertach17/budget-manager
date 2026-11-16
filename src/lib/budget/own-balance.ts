// How a transaction you add to one of your own accounts (like Apple Card)
// changes the balance you typed. The balance already covers everything up to
// the moment you set it, so transactions added after that and dated that
// day or later move it.
// Money out lowers a bank balance and raises what you owe on a card; money
// in (a payment or refund) does the opposite. The category doesn't matter.

export function easternDay(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date);
}

export function balanceChange(
  accountType: string,
  balanceSetOn: string | null, // YYYY-MM-DD, or null when no balance was ever set
  rows: { postedOn: string; amount: number }[],
): number {
  const owed = accountType === "credit" || accountType === "loan";
  let change = 0;
  for (const r of rows) {
    if (balanceSetOn && r.postedOn < balanceSetOn) continue;
    change += owed ? -r.amount : r.amount;
  }
  return Math.round(change * 100) / 100;
}

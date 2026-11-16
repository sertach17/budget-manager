import { readAmount, readDate } from "../statements/parse.ts";

// A transaction you type in yourself. The same checks run in the browser's
// demo and on the server.

export type ManualInput = {
  postedOn: string; // YYYY-MM-DD from the date picker
  description: string;
  amount: string; // what you typed, like 12.50 or $1,200
  direction: "out" | "in";
  categoryId: string; // "" for none
};

export type ManualRow = { postedOn: string; description: string; amount: number; categoryId: string };

export function readManualTransaction(input: ManualInput, today: string): ManualRow | string {
  const postedOn = typeof input.postedOn === "string" ? readDate(input.postedOn) : null;
  if (!postedOn) return "Pick the date.";
  if (postedOn > today) return "The date can't be in the future.";
  const description = typeof input.description === "string" ? input.description.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!description) return "Type what it was, like Corner Store.";
  const typed = typeof input.amount === "string" ? readAmount(input.amount) : null;
  if (typed === null || typed === 0 || Math.abs(typed) >= 10_000_000) return "Type the amount as a number, like 12.50.";
  if (input.direction !== "out" && input.direction !== "in") return "Pick money out or money in.";
  const size = Math.round(Math.abs(typed) * 100) / 100;
  return {
    postedOn,
    description,
    amount: input.direction === "out" ? -size : size,
    categoryId: typeof input.categoryId === "string" ? input.categoryId : "",
  };
}

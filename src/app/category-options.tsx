import type { PickCategory } from "@/lib/budget/types";
import { NEW_INCOME } from "./transactions/new-income";

// Your categories as <option>s, grouped into Spending, Income and Transfers.
// With no income category yet, the Income group offers one that picking makes.
export function CategoryOptions({ categories }: { categories: PickCategory[] }) {
  const income = categories.filter((c) => c.kind === "income");
  const transfers = categories.filter((c) => c.kind === "transfer");
  const spending = categories.filter((c) => c.kind !== "income" && c.kind !== "transfer");
  return (
    <>
      {spending.length ? (
        <optgroup label="Spending">
          {spending.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label="Income">
        {income.length ? (
          income.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))
        ) : (
          <option value={NEW_INCOME}>Income</option>
        )}
      </optgroup>
      {transfers.length ? (
        <optgroup label="Transfers (not counted)">
          {transfers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

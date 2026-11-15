// Plain names for Plaid's category codes, like FOOD_AND_DRINK_GROCERIES ->
// "Food and drink: groceries".
import { plaidGroup } from "./from-db";

const words = (code: string) => {
  const text = code.toLowerCase().replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function plaidCategoryLabel(code: string) {
  const group = plaidGroup(code);
  if (!group || group === code) return words(code);
  const rest = code.slice(group.length + 1).toLowerCase().replace(/_/g, " ");
  return `${words(group)}: ${rest}`;
}

export const PLAID_CODE = /^[A-Z_]{2,80}$/;

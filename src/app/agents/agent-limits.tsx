// What a connected AI agent can and can't do, shown when you approve one and
// on the Connected agents page. The database enforces the same list.
export const AGENT_CAN_READ = ["Accounts and balances", "Transactions", "Budgets by month", "Income", "Goals", "Pending to review"];
export const AGENT_CAN_CHANGE = [
  "Change a transaction's category or goal",
  "Mark transactions reviewed",
  "Add a transaction (it waits under Pending to review)",
  "Add or change a goal",
  "Set a budget",
];
export const AGENT_CANNOT = ["Delete anything", "Touch bank links, Venmo or uploads", "Change settings, categories, your password or two-factor"];

export function AgentLimits() {
  const list = (title: string, items: string[], tone: string) => (
    <div>
      <p className={`text-xs font-medium uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="space-y-3">
      {list("It can see", AGENT_CAN_READ, "text-black/50 dark:text-white/50")}
      {list("It can", AGENT_CAN_CHANGE, "text-black/50 dark:text-white/50")}
      {list("It can't", AGENT_CANNOT, "text-red-600 dark:text-red-400")}
    </div>
  );
}

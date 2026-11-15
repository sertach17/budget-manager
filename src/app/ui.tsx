// Small shared pieces for the sign-in pages.
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 p-8 shadow-sm dark:border-white/15">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Budget Manager</p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export const inputClass =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-emerald-600 dark:border-white/20";

export const buttonClass =
  "w-full rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50";

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

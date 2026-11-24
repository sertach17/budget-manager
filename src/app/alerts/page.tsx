import type { Metadata } from "next";
import { AppHeader } from "../app-header";
import { alertsPublicKey, removeAlertDevice, saveAlertDevice, sendTestAlert } from "./actions";
import { AlertsView } from "./alerts-view";

export const metadata: Metadata = { title: "Phone alerts · Budget Manager" };

function AlertsIntro() {
  return (
    <>
      <h1 className="mt-6 text-xl font-semibold">Phone alerts</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        A notification when new transactions land in Pending to review: after the morning bank sync, and as Apple Wallet and Venmo
        send them. It shows only how many, never amounts or where you spent, and the Budget icon shows how many are waiting.
      </p>
    </>
  );
}

export default function AlertsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <AppHeader />
      <AlertsIntro />
      <AlertsView getPublicKey={alertsPublicKey} onSave={saveAlertDevice} onRemove={removeAlertDevice} onTest={sendTestAlert} />
    </main>
  );
}

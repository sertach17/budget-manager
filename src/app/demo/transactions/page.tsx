import type { Metadata } from "next";
import { DemoTransactions } from "../demo-pages";

export const metadata: Metadata = { title: "Transactions · Budget Manager demo" };

export default function Page() {
  return <DemoTransactions />;
}

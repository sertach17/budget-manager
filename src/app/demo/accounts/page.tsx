import type { Metadata } from "next";
import { DemoAccounts } from "../demo-pages";

export const metadata: Metadata = { title: "Accounts · Budget Manager demo" };

export default function Page() {
  return <DemoAccounts />;
}

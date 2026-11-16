import type { Metadata } from "next";
import { DemoIncome } from "../demo-pages";

export const metadata: Metadata = { title: "Income · Budget Manager demo" };

export default function Page() {
  return <DemoIncome />;
}

import type { Metadata } from "next";
import { DemoBudget } from "../demo-pages";

export const metadata: Metadata = { title: "Budget · Budget Manager demo" };

export default function Page() {
  return <DemoBudget />;
}

import type { Metadata } from "next";
import { DemoCategoryBudget } from "../../demo-pages";

export const metadata: Metadata = { title: "Budget · Budget Manager demo" };

export default function Page() {
  return <DemoCategoryBudget />;
}

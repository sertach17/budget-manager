import type { Metadata } from "next";
import { DemoGoal } from "../../demo-pages";

export const metadata: Metadata = { title: "Goal · Budget Manager demo" };

export default function Page() {
  return <DemoGoal />;
}

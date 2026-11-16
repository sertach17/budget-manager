import type { Metadata } from "next";
import { DemoGoals } from "../demo-pages";

export const metadata: Metadata = { title: "Goals · Budget Manager demo" };

export default function Page() {
  return <DemoGoals />;
}

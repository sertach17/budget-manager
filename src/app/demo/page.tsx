import type { Metadata } from "next";
import { DemoDashboard } from "./demo-pages";

export const metadata: Metadata = { title: "Dashboard · Budget Manager demo" };

export default function Page() {
  return <DemoDashboard />;
}

import type { Metadata } from "next";
import { DemoAlerts } from "../demo-pages";

export const metadata: Metadata = { title: "Phone alerts · Budget Manager demo" };

export default function Page() {
  return <DemoAlerts />;
}

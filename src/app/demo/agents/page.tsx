import type { Metadata } from "next";
import { DemoAgents } from "../demo-pages";

export const metadata: Metadata = { title: "Connected agents · Budget Manager demo" };

export default function Page() {
  return <DemoAgents />;
}

import type { Metadata } from "next";
import { DemoAccount } from "../../demo-pages";

export const metadata: Metadata = { title: "Account · Budget Manager demo" };

export default function Page() {
  return <DemoAccount />;
}

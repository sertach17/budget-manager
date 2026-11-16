import type { Metadata } from "next";
import { DemoBanks } from "../demo-pages";

export const metadata: Metadata = { title: "Banks · Budget Manager demo" };

export default function Page() {
  return <DemoBanks />;
}

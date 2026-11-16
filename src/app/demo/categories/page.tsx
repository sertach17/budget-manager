import type { Metadata } from "next";
import { DemoCategories } from "../demo-pages";

export const metadata: Metadata = { title: "Categories · Budget Manager demo" };

export default function Page() {
  return <DemoCategories />;
}

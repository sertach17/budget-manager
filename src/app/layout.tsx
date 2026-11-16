import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget Manager",
  description: "A private budget tracker.",
  robots: { index: false, follow: false },
  icons: { apple: "/apple-touch-icon.png" },
  // Added to the iPhone home screen, it opens full screen and is named
  // "Budget" under its icon.
  appleWebApp: { capable: true, title: "Budget", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Lets the bottom tabs sit above the iPhone's home bar.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

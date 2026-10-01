import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BTS — Verified Reference Collection | MEDS Talent",
  description:
    "Digital reference collection for nursing talent: mobile-first reference forms, anchored rating scales, skills verification badges, fraud flags, and branded PDF packets.",
  keywords: ["nurse references", "healthcare staffing", "reference verification", "skills checklist", "MEDS Talent"],
  authors: [{ name: "BTS Platform" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "BTS — Verified Reference Collection",
    description: "Reference checks that finish in 48 hours, not weeks.",
    siteName: "BTS Platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

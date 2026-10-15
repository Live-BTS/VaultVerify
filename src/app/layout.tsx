import type { Metadata, Viewport } from "next";
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
  title: "VaultVerify — Verified References & Skills Checklists for Healthcare Hiring",
  description:
    "VaultVerify turns paper reference forms into a secure two-party digital flow: email-verified accounts, consent-gated reference requests, single-use referee links, manager-verified skill badges, a 55+ template checklist library, fraud flags, branded PDF reports and candidate-controlled share links.",
  keywords: ["VaultVerify", "nurse references", "healthcare staffing", "reference verification", "skills checklist", "healthcare compliance", "verified skills"],
  authors: [{ name: "VaultVerify" }],
  openGraph: {
    title: "VaultVerify — References, verified. Skills, proven.",
    description:
      "Consent-gated references, manager-verified skills, single-use secure links and branded PDF reports — reference checks in 48 hours, not weeks.",
    siteName: "VaultVerify",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#081215",
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

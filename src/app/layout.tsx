import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SecurityGuard } from "@/components/bts/shell/SecurityGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VaultVerify — Healthcare Skill Checklist & Verified References",
  description:
    "VaultVerify turns paper reference forms into a secure two-party digital flow: mobile-first reference forms, anchored rating scales, manager-verified skill badges, fraud flags, and branded PDF packets.",
  keywords: ["VaultVerify", "nurse references", "healthcare staffing", "reference verification", "skills checklist", "healthcare compliance"],
  authors: [{ name: "VaultVerify" }],
  openGraph: {
    title: "VaultVerify — Healthcare Skill Checklist",
    description: "References, verified. Skills, proven. Reference checks that finish in 48 hours, not weeks.",
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
        <SecurityGuard />
      </body>
    </html>
  );
}

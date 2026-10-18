import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// SEC-22 + PERF (rendering scheme):
//   App pages ([section], SuperAdmin) are server-rendered PER REQUEST via
//   `force-dynamic` declared in their OWN route layouts — the nonce CSP
//   (src/proxy.ts + lib/bts/csp.ts) needs a per-request render to stamp the
//   nonce into bootstrap scripts ('strict-dynamic' blocks a stale one).
//   NOTE: `force-dynamic` used to live HERE in the root layout, which made
//   every page on the site dynamic — including the pure-static marketing
//   pages, so no page could ever be served from the CDN edge. Layout-level
//   force-dynamic is sticky (a page-level force-static cannot override it),
//   hence the flag now lives only on the two app-route layouts and the
//   static trio (/, /privacy, /terms) is prerendered + CDN-served.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VaultVerify — References & Skills Checklists for Healthcare Hiring",
  description:
    "VaultVerify gives healthcare professionals an honest, portable skills record: a self-assessed skills checklist valid for 30 days, independent professional references through single-use referee links, and candidate-controlled sharing with branded PDF reports.",
  keywords: ["VaultVerify", "nurse references", "healthcare staffing", "reference checks", "skills checklist", "healthcare compliance", "self-assessed skills"],
  authors: [{ name: "VaultVerify" }],
  openGraph: {
    title: "VaultVerify — Honest references. Clearly labeled skills.",
    description:
      "Consent-gated references, self-assessed skills checklists, single-use secure links and branded PDF reports — candidate-controlled and clearly labeled.",
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

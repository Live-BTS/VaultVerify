import type { Metadata } from "next";
import { LegalShell } from "@/components/bts/landing/LegalShell";
import { PRIVACY } from "@/content/privacy";

// PERF: pure-static legal page — prerendered at build, served from the CDN
// edge; exempt from the nonce CSP (see src/proxy.ts).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy — VaultVerify",
  description:
    "What VaultVerify collects (account, verification, technical data), why, who can see it, our processors (Vercel, Supabase, Brevo), retention, security and your rights.",
};

export default function PrivacyPage() {
  return <LegalShell doc={PRIVACY} other={{ href: "/terms", label: "Terms & Conditions" }} />;
}

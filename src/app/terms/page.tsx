import type { Metadata } from "next";
import { LegalShell } from "@/components/bts/landing/LegalShell";
import { TERMS } from "@/content/terms";

// PERF: pure-static legal page — prerendered at build, served from the CDN
// edge; exempt from the nonce CSP (see src/proxy.ts).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms & Conditions — VaultVerify",
  description:
    "The rules for using VaultVerify: accounts, candidate and recruiter responsibilities, what \"verified\" means, credits, acceptable use, liability and disputes.",
};

export default function TermsPage() {
  return <LegalShell doc={TERMS} other={{ href: "/privacy", label: "Privacy Policy" }} />;
}

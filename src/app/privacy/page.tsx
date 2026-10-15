import type { Metadata } from "next";
import { LegalShell } from "@/components/bts/landing/LegalShell";
import { PRIVACY } from "@/content/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy — VaultVerify",
  description:
    "What VaultVerify collects (account, verification, technical data), why, who can see it, our processors (Vercel, Supabase, Brevo), retention, security and your rights.",
};

export default function PrivacyPage() {
  return <LegalShell doc={PRIVACY} other={{ href: "/terms", label: "Terms & Conditions" }} />;
}

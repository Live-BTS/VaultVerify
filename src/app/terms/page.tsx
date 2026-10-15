import type { Metadata } from "next";
import { LegalShell } from "@/components/bts/landing/LegalShell";
import { TERMS } from "@/content/terms";

export const metadata: Metadata = {
  title: "Terms & Conditions — VaultVerify",
  description:
    "The rules for using VaultVerify: accounts, candidate and recruiter responsibilities, what \"verified\" means, credits, acceptable use, liability and disputes.",
};

export default function TermsPage() {
  return <LegalShell doc={TERMS} other={{ href: "/privacy", label: "Privacy Policy" }} />;
}

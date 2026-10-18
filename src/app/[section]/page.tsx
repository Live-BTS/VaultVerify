"use client";

import { notFound, useParams } from "next/navigation";
import { RecruiterDashboard, type RecruiterSection } from "@/components/bts/RecruiterDashboard";

// UX pack: recruiter sections are REAL addressable URLs — /dashboard,
// /references, /skill-checklists, /notifications, /audit. /skill-checklists
// maps to the internal "checklists" section key; anything else 404s as before.
// Static routes (privacy, terms, SuperAdmin, api) take precedence over this
// dynamic segment, and the homepage /?view=... flows are untouched — the
// emailed /?view=checklist&invite=<token> links keep working exactly as-is.
const URL_SECTION: Record<string, RecruiterSection> = {
  dashboard: "dashboard",
  references: "references",
  "skill-checklists": "checklists",
  notifications: "notifications",
  audit: "audit",
};

export default function RecruiterSectionPage() {
  const params = useParams<{ section: string }>();
  const section = URL_SECTION[params.section];
  if (!section) notFound();
  return (
    <RecruiterDashboard
      initialSection={section}
      onSignOut={() => { window.location.href = "/"; }}
    />
  );
}

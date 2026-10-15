"use client";

import { useRouter } from "next/navigation";
import { SuperAdmin } from "@/components/bts/SuperAdmin";

// ── /SuperAdmin — dedicated console URL ──────────────────────────
// The console is intentionally NOT linked from the public site; admins
// reach it by typing this address. Sign-in is the emailed-OTP gate
// (or the static backup code), so the page itself is safe to expose.
export default function SuperAdminPage() {
  const router = useRouter();
  return <SuperAdmin onExit={() => router.push("/")} />;
}

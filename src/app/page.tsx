"use client";

import { useCallback, useEffect, useState } from "react";
import { LandingView, type AgencyInfo, type Role } from "@/components/bts/LandingView";
import { CandidateWizard, type CreatedCandidate } from "@/components/bts/CandidateWizard";
import { CandidateDashboard } from "@/components/bts/CandidateDashboard";
import { RecruiterDashboard } from "@/components/bts/RecruiterDashboard";
import { ReferenceFlow } from "@/components/bts/ReferenceFlow";
import { Spinner } from "@/components/bts/brand";

type View = "home" | "wizard" | "candidate" | "recruiter";

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [refToken, setRefToken] = useState<string | null>(null);
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("r");
      try {
        const res = await fetch("/api/bootstrap");
        const d = await res.json();
        if (!cancelled && d.agency) setAgency(d.agency);
      } catch {
        /* fall back to default branding */
      }
      if (cancelled) return;
      if (r) setRefToken(r);
      setBooted(true);
      if (r && window.history?.replaceState) {
        window.history.replaceState({}, "", "/");
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const exitReference = useCallback(() => {
    setRefToken(null);
    setView("home");
  }, []);

  const openReference = useCallback((token: string) => {
    setRefToken(token);
  }, []);

  // ── Reference flow (token deep-link) ──
  if (refToken) {
    return <ReferenceFlow token={refToken} onExit={exitReference} />;
  }

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner label="Preparing the workspace…" />
      </div>
    );
  }

  const goHome = () => setView("home");

  const fallbackAgency: AgencyInfo = agency ?? { id: "demo", name: "MEDS Talent", logoText: "MEDS", tagline: "Verified references. Faster placements.", primaryColor: "#0F766E", accentColor: "#B45309" };

  switch (view) {
    case "wizard":
      return (
        <div className="min-h-screen bg-slate-50">
          <CandidateWizard
            agency={fallbackAgency}
            onBack={goHome}
            onDone={(c: CreatedCandidate) => {
              localStorage.setItem("bts_candidate_email", c.email);
              setView("candidate");
            }}
          />
        </div>
      );
    case "candidate":
      return <CandidateDashboard onSignOut={goHome} onOpenReference={openReference} />;
    case "recruiter":
      return <RecruiterDashboard onSignOut={goHome} />;
    default:
      return (
        <LandingView
          agency={agency}
          onRole={(r: Role) => setView(r === "candidate" ? "wizard" : "recruiter")}
          stats={{ completionRate: 86, avgTimeHours: 31 }}
        />
      );
  }
}

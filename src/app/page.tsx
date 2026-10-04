"use client";

import { useCallback, useEffect, useState } from "react";
import { LandingView, type AgencyInfo, type Role } from "@/components/bts/LandingView";
import { CandidateWizard, type CreatedCandidate } from "@/components/bts/CandidateWizard";
import { CandidateDashboard } from "@/components/bts/CandidateDashboard";
import { RecruiterDashboard } from "@/components/bts/RecruiterDashboard";
import { ReferenceFlow } from "@/components/bts/ReferenceFlow";
import { ChecklistPortal } from "@/components/bts/checklist/ChecklistPortal";
import { ShareView } from "@/components/bts/checklist/ShareView";
import { ReferenceShareView } from "@/components/bts/checklist/ReferenceShareView";
import { Spinner, VaultMark } from "@/components/bts/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type View = "home" | "wizard" | "candidate" | "recruiter" | "checklist" | "share" | "refshare";

interface VerifyState { status: "pending" | "ok" | "error"; message?: string; role?: "CANDIDATE" | "RECRUITER"; onboardingComplete?: boolean }

// ── Password reset interstitial (/?reset=<token> from the security center) ──
function ResetPanel({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password_reset", token, password }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Reset failed");
      setDone(true);
      setTimeout(onDone, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#d8e6da] bg-white p-8 vv-card-shadow">
        <div className="flex flex-col items-center text-center">
          <VaultMark size={40} />
          {done ? (
            <>
              <p className="mt-4 text-base font-semibold text-jade-ink">Password updated</p>
              <p className="mt-2 text-sm text-jade-muted">All old sessions were signed out — sign in with your new password.</p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-lg font-semibold text-jade-ink">Set a new password</h1>
              <p className="mt-1 text-sm text-jade-muted">Choose a strong password for your VaultVerify account.</p>
              <form onSubmit={submit} className="mt-5 w-full text-left">
                <Label htmlFor="rp1" className="text-jade-ink/80">New password</Label>
                <Input id="rp1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                  className="mt-1.5 border-[#d8e6da] bg-white text-jade-ink" />
                <Label htmlFor="rp2" className="mt-3 block text-jade-ink/80">Confirm password</Label>
                <Input id="rp2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                  className="mt-1.5 border-[#d8e6da] bg-white text-jade-ink" />
                {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
                <Button type="submit" disabled={busy} className="mt-5 w-full bg-[#0b3d3f] text-white hover:bg-[#0b3d3f]/90">
                  {busy ? "Saving…" : "Save new password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [refToken, setRefToken] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [refShareToken, setRefShareToken] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [wizardPrefill, setWizardPrefill] = useState<{ name: string; email: string; role: string } | undefined>(undefined);
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [booted, setBooted] = useState(false);
  const [verify, setVerify] = useState<VerifyState | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("r");
      const s = params.get("s");
      const rs = params.get("rs");
      const invite = params.get("invite");
      const view = params.get("view");
      const verifyToken = params.get("verify");
      const resetTokenParam = params.get("reset");
      if (resetTokenParam) {
        setResetToken(resetTokenParam);
        if (window.history?.replaceState) window.history.replaceState({}, "", "/");
        setBooted(true);
        return;
      }
      try {
        const res = await fetch("/api/bootstrap");
        const d = await res.json();
        if (!cancelled && d.agency) setAgency(d.agency);
      } catch {
        /* fall back to default branding */
      }
      if (cancelled) return;
      // ── Email-verification deep link (/?verify=<token>) ──
      if (verifyToken) {
        setVerify({ status: "pending" });
        try {
          const res = await fetch("/api/auth", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify", token: verifyToken }),
          });
          const d = await res.json();
          if (d.ok) {
            setVerify({ status: "ok", role: d.role, onboardingComplete: d.onboardingComplete });
            setTimeout(() => {
              if (cancelled) return;
              setVerify(null);
              setView(d.role === "RECRUITER" ? "recruiter" : "checklist");
            }, 1600);
          } else {
            setVerify({ status: "error", message: d.error ?? "This link is invalid or has expired." });
          }
        } catch {
          setVerify({ status: "error", message: "Could not reach the server — try the link again." });
        }
        if (window.history?.replaceState) window.history.replaceState({}, "", "/");
        setBooted(true);
        return;
      }
      if (r) setRefToken(r);
      if (s) setShareToken(s);
      if (rs) setRefShareToken(rs);
      if (invite) setInviteToken(invite);
      if (view === "checklist") setView("checklist");
      if (view === "recruiter") setView("recruiter");
      if (s) setView("share");
      if (rs) setView("refshare");
      // ── Signed-in users land directly in their portal ──
      if (!r && !s && !rs && !invite && !view && !verifyToken) {
        try {
          const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "me" }) });
          const d = await res.json();
          if (!cancelled && d.ok && d.account) {
            setView(d.role === "RECRUITER" ? "recruiter" : "checklist");
          }
        } catch { /* landing stays */ }
      }
      setBooted(true);
      if ((r || s || rs) && window.history?.replaceState) {
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
      <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5]">
        <Spinner label="Preparing the workspace…" />
      </div>
    );
  }

  const goHome = () => setView("home");

  // ── Password reset interstitial ──
  if (resetToken) {
    return <ResetPanel token={resetToken} onDone={() => setResetToken(null)} />;
  }

  // ── Email verification interstitial ──
  if (verify) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#d8e6da] bg-white p-8 text-center vv-card-shadow">
          <VaultMark size={44} />
          {verify.status === "pending" && (
            <>
              <p className="mt-4 text-base font-semibold text-jade-ink">Verifying your email…</p>
              <div className="mt-5"><Spinner label="One moment" /></div>
            </>
          )}
          {verify.status === "ok" && (
            <>
              <p className="mt-4 text-base font-semibold text-jade-ink">Email verified</p>
              <p className="mt-2 text-sm text-jade-muted">Taking you to your portal…</p>
            </>
          )}
          {verify.status === "error" && (
            <>
              <p className="mt-4 text-base font-semibold text-jade-ink">Link problem</p>
              <p className="mt-2 text-sm leading-relaxed text-jade-muted">{verify.message}</p>
              <button type="button" onClick={() => { setVerify(null); setView("home"); }} className="mt-5 text-sm font-semibold text-verify-ink underline">
                Back to the site
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const fallbackAgency: AgencyInfo = agency ?? { id: "demo", name: "VaultVerify", logoText: "VV", tagline: "References, verified. Skills, proven.", primaryColor: "#03363d", accentColor: "#7cc118" };

  switch (view) {
    case "wizard":
      return (
        <div className="min-h-screen bg-slate-50">
          <CandidateWizard
            agency={fallbackAgency}
            initial={wizardPrefill}
            onBack={wizardPrefill ? () => setView("checklist") : goHome}
            onDone={(c: CreatedCandidate) => {
              localStorage.setItem("bts_candidate_email", c.email);
              setView("checklist");
            }}
          />
        </div>
      );
    case "candidate":
      return <CandidateDashboard onSignOut={goHome} onOpenReference={openReference} />;
    case "recruiter":
      return <RecruiterDashboard onSignOut={goHome} />;
    case "checklist":
      return <ChecklistPortal inviteToken={inviteToken} onExit={goHome}
        onLaunchReferences={(p) => { setWizardPrefill(p); setView("wizard"); }} />;
    case "share":
      return <ShareView token={shareToken ?? ""} onExit={goHome} />;
    case "refshare":
      return <ReferenceShareView token={refShareToken ?? ""} onExit={goHome} />;
    default:
      return (
        <LandingView
          agency={agency}
          onRole={(r: Role) => setView(r === "checklist" || r === "candidate" ? "checklist" : "recruiter")}
          stats={{ completionRate: 86, avgTimeHours: 31 }}
        />
      );
  }
}

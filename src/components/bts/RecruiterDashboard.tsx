"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AgencyLogo, StatusBadge, SkillBadge, FlagChip, RatingPips, Spinner } from "./brand";
import { specialtyLabel } from "@/lib/bts/constants";
import { QUESTIONS } from "@/lib/bts/questions";
import { RecruiterChecklists } from "./checklist/RecruiterChecklists";
import { AuthPanel } from "./AuthPanel";
import { RecruiterOnboarding } from "./RecruiterOnboarding";
import { PortalShell } from "./shell/PortalShell";
import { cn } from "@/lib/utils";
import { RefreshCcw, ShieldAlert, Inbox, Users, Clock3, Star, Flag, LayoutDashboard, ClipboardList, FileSearch, Eye, Check } from "lucide-react";

interface ReqRow {
  id: string;
  status: string;
  refName: string;
  refTitle: string;
  refEmail: string;
  facilityName: string;
  relationship: string;
  sentAt: string;
  completedAt: string | null;
  daysOpen: number;
  refLink: string;
  flags: { id: string; type: string; severity: string; detail: string; resolved: boolean }[];
  shares: { accessType: string; expiresAt: string | null; viewedAt: string | null; revoked: boolean }[];
  candidate: {
    id: string; fullName: string; role: string; specialty: string; city: string; state: string; email: string;
    skills: { skillName: string; proficiency: string; highRisk: boolean }[];
  };
  response: {
    identityMethod: string;
    overallRating: number | null;
    q8Discipline: boolean;
    q8Explanation: string | null;
    remarks: string;
    signatureName: string;
    signedAt: string;
    durationSeconds: number;
    answers: string;
    skillChecks: { skillName: string; nurseProficiency: string; confirmed: boolean; refProficiency: string | null }[];
  } | null;
}

interface RecruiterData {
  agency: { name: string; logoText: string; primaryColor: string; accentColor: string; tagline: string };
  stats: {
    totalRequests: number; completedCount: number; completionRate: number;
    flaggedCount: number; pendingCount: number; medianCompletionSeconds: number | null; avgRating: number | null;
  };
  // UX pack: the dashboard represents BOTH pipelines now — these five numbers
  // cover the skills-checklist flow (sent / opened / awaiting / completed / %).
  checklistStats: { sent: number; completed: number; opened: number; awaiting: number; rate: number };
  requests: ReqRow[];
}

const IDENTITY_LABEL: Record<string, string> = {
  EMAIL_DOMAIN: "Employer email domain (self-attested)",
  // SEC-08 honesty: the callback code is arranged between referee and candidate
  // (derivable from the invite token) — it is NOT an independent platform check.
  CALLBACK_CODE: "Phone callback code (self-arranged, not independently checked)",
  ACCOUNT: "VaultVerify account with verified email",
  SKIPPED: "Not verified — skipped",
};
const identityLabel = (m: string) => IDENTITY_LABEL[m] ?? m;
// SEC-01(a)/SEC-15/CH-05: share tokens are the candidate's bearer capability —
// they are no longer sent to recruiters at all (payload minimization), so the
// recruiter UI no longer builds share-token PDF links.

// UX pack: every section is a REAL addressable URL (/dashboard, /references,
// /skill-checklists) — refresh keeps your place, the back button works, and
// sections can be opened in new tabs. pushState keeps navigation instant
// (no remount/refetch); popstate syncs section state on back/forward.
export type RecruiterSection = "dashboard" | "references" | "checklists" | "notifications" | "audit";
const SECTION_PATH: Record<RecruiterSection, string> = {
  dashboard: "/dashboard",
  references: "/references",
  checklists: "/skill-checklists",
  notifications: "/notifications",
  audit: "/audit",
};
const PATH_SECTION: Record<string, RecruiterSection> = Object.fromEntries(
  Object.entries(SECTION_PATH).map(([k, v]) => [v, k as RecruiterSection])
);

export function RecruiterDashboard({ onSignOut, initialSection = "dashboard" }: { onSignOut: () => void; initialSection?: RecruiterSection }) {
  const { toast } = useToast();
  // (legacy agency access-code state removed — account session is the only path)
  const [me, setMe] = useState<{ name: string; email: string; onboardingComplete: boolean } | null>(null);
  const [data, setData] = useState<RecruiterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReqRow | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [section, setSectionState] = useState<RecruiterSection>(initialSection);

  const navigate = useCallback((key: RecruiterSection) => {
    setSectionState(key);
    try { window.history.pushState({}, "", SECTION_PATH[key]); } catch { /* URL sync is cosmetic */ }
  }, []);

  useEffect(() => {
    const onPop = () => {
      const key = PATH_SECTION[window.location.pathname];
      if (key) setSectionState(key);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiter");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Sign-in failed");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // UX pack (C3): live refresh — re-pull when the tab regains focus so the
  // "Waiting" states and progress numbers are never stale on a glance.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible" && me) load(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, me]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Account session probe — verified recruiters land straight on the dashboard.
      try {
        const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "me" }) });
        const d = await res.json();
        if (alive && d.ok && d.account && d.role === "RECRUITER") {
          const account = d.account;
          setMe(account);
          if (account.onboardingComplete) load();
        }
      } catch { /* gate renders */ }
    })();
    return () => { alive = false; };
  }, [load]);

  const sweep = async () => {
    setSweeping(true);
    try {
      const res = await fetch("/api/recruiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_reminders" }),
      });
      const d = await res.json();
      if (res.ok) {
        toast({ title: d.message });
        await load(); // session path — keep day counters and statuses fresh
      } else toast({ title: d.error ?? "Sweep failed", variant: "destructive" });
    } finally {
      setSweeping(false);
    }
  };

  const signOut = async () => {
    try { await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signout" }) }); } catch { /* session may already be gone */ }
    setMe(null);
    setData(null);
    onSignOut();
  };

  if (data) {
    // (dashboard renders below)
  } else if (me && !me.onboardingComplete) {
    return (
      <RecruiterOnboarding
        me={{ name: me.name, email: me.email }}
        onSaved={async () => { setMe({ ...me, onboardingComplete: true }); await load(); }}
        onSignOut={signOut}
      />
    );
  } else {
    // Account auth is the only door: the static agency access code is retired
    // server-side (the API 401s without an account session), so the legacy
    // code form was removed rather than left as a dead end.
    return (
      <AuthPanel
        onAuthenticated={(info) => {
          const account = { name: info.name, email: info.email, onboardingComplete: info.onboardingComplete };
          setMe(account);
          if (account.onboardingComplete) load();
        }}
        onExit={onSignOut}
      />
    );
  }

  const s = data.stats;
  const cs = data.checklistStats;
  const flaggedRequests = data.requests.filter((r) => r.status === "FLAGGED");
  const awaitingRequests = data.requests.filter((r) => r.status === "SENT" || r.status === "OPENED" || r.status === "IN_PROGRESS");
  const nothingYet = s.totalRequests === 0 && cs.sent === 0;
  return (
    <PortalShell
      badge="Recruiter console"
      brandOverride={
        <div className="px-4 pb-4 pt-6">
          <AgencyLogo logoText={data.agency?.logoText ?? "VV"} name={data.agency?.name ?? "VaultVerify"} />
        </div>
      }
      userName={me ? me.name : `Recruiter · ${data.agency?.name ?? "VaultVerify"}`}
      userEmail={me ? me.email : "Access-code sign-in"}
      wide
      active={section}
      onNavigate={(k) => navigate(k as RecruiterSection)}
      onSignOut={signOut}
      headerActions={
        <Button size="sm" variant="outline" onClick={sweep} disabled={sweeping} className="border-verify-green/40 text-verify-ink hover:bg-verify-green/10">
          <RefreshCcw className={cn("mr-1.5 h-3.5 w-3.5", sweeping && "animate-spin")} /> Run reminder sweep
        </Button>
      }
      nav={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { key: "references", label: "References", icon: FileSearch, badge: awaitingRequests.length || undefined },
        { key: "checklists", label: "Skill checklists", icon: ClipboardList },
      ]}
    >
      {/* ── Dashboard ── */}
      {section === "dashboard" && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: Users, label: "Requests", value: String(s.totalRequests), sub: "all time" },
              { icon: Star, label: "Completion", value: `${s.completionRate}%`, sub: "target >70%", good: s.completionRate >= 70 },
              { icon: Inbox, label: "Pending", value: String(s.pendingCount), sub: "awaiting refs" },
              { icon: Flag, label: "Flagged", value: String(s.flaggedCount), sub: "fraud review", danger: s.flaggedCount > 0 },
              { icon: Clock3, label: "Median time", value: s.medianCompletionSeconds ? `${Math.round(s.medianCompletionSeconds / 60)}m` : "—", sub: "per form" },
              { icon: Star, label: "Avg rating", value: s.avgRating != null ? s.avgRating.toFixed(1) : "—", sub: "out of 5.0" },
            ].map((c) => (
              <Card key={c.label} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <c.icon className={cn("h-3.5 w-3.5", c.danger ? "text-rose-500" : c.good ? "text-teal-600" : "text-slate-400")} />
                    {c.label}
                  </div>
                  <p className={cn("mt-1.5 text-2xl font-bold", c.danger ? "text-rose-600" : c.good ? "text-teal-700" : "text-slate-900")}>{c.value}</p>
                  <p className="text-[11px] text-slate-400">{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* UX pack: the checklist pipeline — the six cards above count references only */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { icon: ClipboardList, label: "Checklists sent", value: String(cs.sent), sub: "all time" },
              { icon: Eye, label: "Opened", value: String(cs.opened), sub: "link clicked, not done" },
              { icon: Clock3, label: "Awaiting", value: String(cs.awaiting), sub: "not completed yet" },
              { icon: Check, label: "Completed", value: String(cs.completed), sub: "valid 30 days" },
              { icon: Star, label: "Completion", value: `${cs.rate}%`, sub: "sent → completed", good: cs.sent > 0 && cs.rate >= 70 },
            ].map((c) => (
              <Card key={c.label} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <c.icon className={cn("h-3.5 w-3.5", c.good ? "text-teal-600" : "text-slate-400")} />
                    {c.label}
                  </div>
                  <p className={cn("mt-1.5 text-2xl font-bold", c.good ? "text-teal-700" : "text-slate-900")}>{c.value}</p>
                  <p className="text-[11px] text-slate-400">{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* needs attention */}
          {nothingYet ? (
            <Card className="border-dashed border-teal-300 bg-teal-50/40">
              <CardContent className="p-8 text-center">
                <p className="text-base font-semibold text-slate-900">Start by sending a skills checklist</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  Pick a profession and specialty, add the candidate's email, and VaultVerify does the rest —
                  the candidate fills the checklist once, adds their own referees from their portal, and the
                  verified reports land right here.
                </p>
                <Button onClick={() => navigate("checklists")} className="mt-5 bg-teal-700 hover:bg-teal-800">
                  <ClipboardList className="mr-2 h-4 w-4" /> Send your first checklist
                </Button>
              </CardContent>
            </Card>
          ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Flag className="h-4 w-4 text-rose-500" /> Fraud review ({flaggedRequests.length})</p>
                <div className="mt-3 space-y-2">
                  {flaggedRequests.slice(0, 4).map((r) => (
                    <button key={r.id} type="button" onClick={() => { navigate("references"); setDetail(r); }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-left text-sm transition hover:bg-rose-50">
                      <span className="text-slate-800">{r.candidate.fullName} · {r.refName}</span>
                      <span className="text-xs font-semibold text-rose-600">In review</span>
                    </button>
                  ))}
                  {flaggedRequests.length === 0 && <p className="py-3 text-sm text-slate-400">Nothing flagged — pipeline is clean.</p>}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock3 className="h-4 w-4 text-amber-500" /> Awaiting references ({awaitingRequests.length})</p>
                <div className="mt-3 space-y-2">
                  {awaitingRequests.slice(0, 4).map((r) => (
                    <button key={r.id} type="button" onClick={() => { navigate("references"); setDetail(r); }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:bg-slate-50">
                      <span className="text-slate-800">{r.candidate.fullName} · {r.refName}</span>
                      <span className="text-xs text-slate-400">day {r.daysOpen}</span>
                    </button>
                  ))}
                  {awaitingRequests.length === 0 && <p className="py-3 text-sm text-slate-400">No open requests right now.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
          )}
        </div>
      )}

      {/* ── References pipeline ── */}
      {section === "references" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Employment &amp; capability verification — one request per reference. Click a row for the full verified report.</p>
          {data.requests.map((r) => {
                const inReview = r.status === "FLAGGED";
                return (
                  <Card
                    key={r.id}
                    className={cn("cursor-pointer border-slate-200 transition hover:border-teal-300 hover:shadow-sm", r.status === "FLAGGED" && "border-rose-200 bg-rose-50/40")}
                    onClick={() => setDetail(r)}
                  >
                    <CardContent className="flex flex-wrap items-center gap-4 p-4">
                      <div className="min-w-44 flex-1">
                        <p className="font-semibold text-slate-900">
                          {r.candidate.fullName} <span className="font-normal text-slate-400">· {r.candidate.role}</span>
                        </p>
                        <p className="text-xs text-slate-500">{specialtyLabel(r.candidate.specialty)} · {r.candidate.city}, {r.candidate.state}</p>
                      </div>
                      <div className="min-w-40 flex-1">
                        <p className="text-sm text-slate-700">{r.refName}</p>
                        <p className="text-xs text-slate-400">{r.refTitle} · {r.facilityName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {(() => {
                          // CH-06 access banner: what the candidate has actually shared with this recruiter
                          const active = r.shares.filter((s) => !s.revoked
                            && !(s.expiresAt && new Date(s.expiresAt) < new Date())
                            && !(s.accessType === "ONE_TIME" && s.viewedAt)).length;
                          return active > 0 ? (
                            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700" title="The candidate shared this report with you">
                              {active} active share{active > 1 ? "s" : ""}
                            </span>
                          ) : null;
                        })()}
                        {(r.status === "SENT" || r.status === "OPENED" || r.status === "IN_PROGRESS") && <span className="text-xs text-slate-400">day {r.daysOpen}</span>}
                      </div>
                      <div className="w-24">{r.response?.overallRating != null && <RatingPips value={r.response.overallRating} />}</div>
                      <div className="w-24">
                        {inReview && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            <ShieldAlert className="h-3 w-3" /> review
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      )}

      {/* ── Checklists (self-assessments — separate from references) ── */}
      {section === "checklists" && (
        <RecruiterChecklists recruiterName={me ? me.name : `Recruiter · ${data.agency?.name ?? "VaultVerify"}`} />
      )}
      {/* Notifications and audit tails were removed with the payload
          minimization (server sends no such rows to recruiters) — the nav
          items rendered permanent dead ends. */}

      {/* ── Detail dialog ── */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-3">
                  {detail.candidate.fullName} — {detail.refName}
                  <StatusBadge status={detail.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-4 rounded-lg border bg-slate-50 p-4">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-400">Candidate</p>
                    <p className="mt-1 text-slate-800">{detail.candidate.fullName}, {detail.candidate.role}</p>
                    <p className="text-xs text-slate-500">{specialtyLabel(detail.candidate.specialty)} · {detail.candidate.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-400">Reference</p>
                    <p className="mt-1 text-slate-800">{detail.refName} — {detail.refTitle}</p>
                    <p className="text-xs text-slate-500">{detail.refEmail} · {detail.facilityName}</p>
                  </div>
                </div>

                {detail.status === "FLAGGED" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
                    This report is in trust &amp; safety review. Screening details are handled by VaultVerify's team — the review outcome appears here once complete.
                  </div>
                )}

                {detail.response ? (
                  <>
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
                      <div>
                        <p className="text-xs font-medium uppercase text-slate-400">Average rating</p>
                        <div className="mt-1"><RatingPips value={detail.response.overallRating} /></div>
                      </div>
                      <div className="text-xs text-slate-500">
                        Signed by <strong className="text-slate-700">{detail.response.signatureName}</strong> · {new Date(detail.response.signedAt).toLocaleString("en-US")} · identity: {identityLabel(detail.response.identityMethod)} · took {Math.max(1, Math.round(detail.response.durationSeconds / 60))} min
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Answers</p>
                      <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                        {((() => {
                          try { return JSON.parse(detail.response.answers || "[]"); }
                          catch { return []; } // corrupt/legacy row — render an empty table, not a crash
                        })() as { key: string; type: string; value: string | number | boolean | null; unableToObserve?: boolean }[]).map((a) => {
                          const q = QUESTIONS.find((qq) => qq.key === a.key);
                          let val = String(a.value ?? "");
                          if (a.unableToObserve) val = "Unable to observe";
                          else if (a.type === "rating") val = `${a.value}/5`;
                          else if (a.type === "boolean") val = a.value === "YES" ? "Yes" : a.value === "NO" ? "No" : "Prefer not to say";
                          return (
                            <div key={a.key} className="flex items-start justify-between gap-4 border-b pb-2">
                              <p className="max-w-[60%] text-xs text-slate-500">{q?.title ?? a.key}</p>
                              <p className="text-right text-sm font-medium text-slate-800">{val}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {detail.response.q8Discipline && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                        <strong>Q8 disciplinary disclosure:</strong> {detail.response.q8Explanation}
                      </div>
                    )}
                    {detail.response.remarks && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remarks</p>
                        <p className="mt-1.5 leading-relaxed text-slate-700">{detail.response.remarks}</p>
                      </div>
                    )}

                    {detail.response.skillChecks.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Skills verification</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {detail.response.skillChecks.map((sc) => (
                            <SkillBadge key={sc.skillName} name={sc.skillName} verified={sc.confirmed} proficiency={sc.confirmed ? sc.nurseProficiency : sc.refProficiency ?? sc.nurseProficiency} />
                          ))}
                        </div>
                      </div>
                    )}

                    {detail.status === "COMPLETED" || detail.status === "FLAGGED" ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your access</p>
                        {detail.shares.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500">No share links right now — the candidate hasn&apos;t shared this report with you yet.</p>
                        ) : (
                          <ul className="mt-1.5 space-y-1">
                            {detail.shares.map((s, i) => (
                              <li key={i} className="text-xs text-slate-600">
                                {s.revoked
                                  ? "Revoked by the candidate"
                                  : s.accessType === "ONE_TIME"
                                    ? (s.viewedAt ? `One-time link — viewed ${new Date(s.viewedAt).toLocaleDateString("en-US")}` : "One-time link — not yet opened")
                                    : s.expiresAt && new Date(s.expiresAt) < new Date()
                                      ? "Date-limited link — expired"
                                      : `Date-limited link — active until ${s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("en-US") : "—"}`}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-[11px] text-slate-400">The candidate controls these links and can revoke or extend them anytime. Revoking stops future access — copies already viewed or downloaded can&apos;t be retracted.</p>
                      </div>
                    ) : (
                      <p className="text-center text-xs text-slate-400">Branded PDF packet generates automatically once this reference is signed.</p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">
                    Awaiting response — currently <StatusBadge status={detail.status} /> on day {detail.daysOpen}.
                    <br />
                    <span className="text-xs">Auto-reminders at day 2 · 5 · 9, link expires day 14.</span>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}

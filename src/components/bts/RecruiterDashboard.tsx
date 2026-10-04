"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AgencyLogo, StatusBadge, SkillBadge, FlagChip, RatingPips, Spinner } from "./brand";
import { specialtyLabel, STATUS_META } from "@/lib/bts/constants";
import { QUESTIONS } from "@/lib/bts/questions";
import { RecruiterChecklists } from "./checklist/RecruiterChecklists";
import { PortalShell } from "./shell/PortalShell";
import { cn } from "@/lib/utils";
import { LogIn, RefreshCcw, Download, ShieldAlert, Activity, Inbox, Users, Clock3, Star, Flag, Database, LayoutDashboard, ClipboardList, BellRing, FileSearch } from "lucide-react";

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
  candidate: {
    id: string; fullName: string; role: string; specialty: string; city: string; state: string; email: string;
    agency: { name: string; logoText: string };
    skills: { skillName: string; proficiency: string; highRisk: boolean }[];
  };
  response: {
    id: string;
    identityMethod: string;
    overallRating: number | null;
    q8Discipline: boolean;
    q8Explanation: string | null;
    remarks: string;
    signatureName: string;
    signedAt: string;
    durationSeconds: number;
    skillsVerified: boolean;
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
  requests: ReqRow[];
  notifications: { id: string; channel: string; kind: string; to: string; body: string; status: string; createdAt: string }[];
  audit: { id: string; actorType: string; action: string; entity: string; entityId: string; ip: string; createdAt: string }[];
}

export function RecruiterDashboard({ onSignOut, onSuperAdmin }: { onSignOut: () => void; onSuperAdmin?: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [data, setData] = useState<RecruiterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReqRow | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [section, setSection] = useState<"dashboard" | "references" | "checklists" | "notifications" | "audit">("dashboard");

  const load = useCallback(async (c: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiter?code=${encodeURIComponent(c)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Sign-in failed");
      setData(d);
      sessionStorage.setItem("bts_recruiter_code", c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("bts_recruiter_code");
    if (stored) {
      setCode(stored);
      load(stored);
    }
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
        if (code) load(code);
      } else toast({ title: d.error ?? "Sweep failed", variant: "destructive" });
    } finally {
      setSweeping(false);
    }
  };

  const unflag = async (requestId: string) => {
    const res = await fetch("/api/recruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unflag_request", requestId }),
    });
    const d = await res.json();
    if (res.ok) {
      toast({ title: d.message });
      setDetail(null);
      if (code) load(code);
    } else toast({ title: d.error ?? "Failed", variant: "destructive" });
  };

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <Card className="border-slate-200">
          <CardContent className="p-8">
            <div className="flex items-center gap-2 text-teal-700">
              <Database className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Recruiter access</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Pipeline dashboard</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter the recruiter access code you received from VaultVerify.
              {process.env.NODE_ENV === "development" && (
                <> Sandbox demo code: <button type="button" className="font-mono font-semibold text-teal-700 underline" onClick={() => { setCode("meds2026"); load("meds2026"); }}>meds2026</button></>
              )}
            </p>
            <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (code.trim()) load(code.trim()); }}>
              <div>
                <Label htmlFor="code">Access code</Label>
                <Input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1.5" required />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full bg-teal-700 hover:bg-teal-800">
                {loading ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <LogIn className="mr-1.5 h-4 w-4" />}
                Enter dashboard
              </Button>
            </form>
            {onSuperAdmin && (
              <button type="button" onClick={onSuperAdmin} className="mt-4 w-full text-center text-xs text-slate-500 underline hover:text-teal-700">
                Platform admin? Open Super Admin console
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = data.stats;
  const flaggedRequests = data.requests.filter((r) => r.status === "FLAGGED");
  const awaitingRequests = data.requests.filter((r) => r.status === "SENT" || r.status === "OPENED" || r.status === "IN_PROGRESS");
  return (
    <PortalShell
      badge="Recruiter console"
      brandOverride={
        <div className="px-4 pb-4 pt-6">
          <AgencyLogo logoText={data.agency.logoText} name={data.agency.name} />
        </div>
      }
      userName={`Recruiter · ${data.agency.name}`}
      userEmail="Access-code sign-in"
      wide
      active={section}
      onNavigate={(k) => setSection(k as "dashboard" | "references" | "checklists" | "notifications" | "audit")}
      onSignOut={() => { sessionStorage.removeItem("bts_recruiter_code"); onSignOut(); }}
      headerActions={
        <Button size="sm" variant="outline" onClick={sweep} disabled={sweeping} className="border-verify-green/40 text-verify-ink hover:bg-verify-green/10">
          <RefreshCcw className={cn("mr-1.5 h-3.5 w-3.5", sweeping && "animate-spin")} /> Run reminder sweep
        </Button>
      }
      nav={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { key: "references", label: "References", icon: FileSearch, badge: awaitingRequests.length || undefined },
        { key: "checklists", label: "Skill checklists", icon: ClipboardList },
        { key: "notifications", label: "Notifications", icon: BellRing, badge: data.notifications.length },
        { key: "audit", label: "Audit trail", icon: Activity },
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

          {/* needs attention */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Flag className="h-4 w-4 text-rose-500" /> Fraud review ({flaggedRequests.length})</p>
                <div className="mt-3 space-y-2">
                  {flaggedRequests.slice(0, 4).map((r) => (
                    <button key={r.id} type="button" onClick={() => { setSection("references"); setDetail(r); }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-left text-sm transition hover:bg-rose-50">
                      <span className="text-slate-800">{r.candidate.fullName} · {r.refName}</span>
                      <span className="text-xs font-semibold text-rose-600">{r.flags.filter((f) => !f.resolved).length} open</span>
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
                    <button key={r.id} type="button" onClick={() => { setSection("references"); setDetail(r); }}
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
        </div>
      )}

      {/* ── References pipeline ── */}
      {section === "references" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Employment &amp; capability verification — one request per reference. Click a row for the full verified report.</p>
          {data.requests.map((r) => {
                const openFlags = r.flags.filter((f) => !f.resolved);
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
                        {(r.status === "SENT" || r.status === "OPENED" || r.status === "IN_PROGRESS") && <span className="text-xs text-slate-400">day {r.daysOpen}</span>}
                      </div>
                      <div className="w-24">{r.response?.overallRating != null && <RatingPips value={r.response.overallRating} />}</div>
                      <div className="w-24">
                        {openFlags.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            <ShieldAlert className="h-3 w-3" /> {openFlags.length}
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
        <RecruiterChecklists code={code} recruiterName={`Recruiter · ${data.agency.name}`} />
      )}

      {/* ── Notifications ── */}
      {section === "notifications" && (
            <Card className="border-slate-200">
              <CardContent className="max-h-[32rem] divide-y overflow-y-auto p-0">
                {data.notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 p-4">
                    <span className={cn("mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", n.channel === "SMS" ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800")}>{n.channel}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{n.body}</p>
                      <p className="mt-1 text-xs text-slate-400">to {n.to} · {n.kind.toLowerCase()} · {new Date(n.createdAt).toLocaleString("en-US")} · {n.status}</p>
                    </div>
                  </div>
                ))}
                {data.notifications.length === 0 && <p className="p-6 text-sm text-slate-400">No notifications yet.</p>}
              </CardContent>
            </Card>
      )}

      {/* ── Audit ── */}
      {section === "audit" && (
            <Card className="border-slate-200">
              <CardContent className="max-h-[32rem] divide-y overflow-y-auto p-0 font-mono text-xs">
                {data.audit.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3">
                    <Activity className="h-3 w-3 shrink-0 text-slate-300" />
                    <span className="w-36 shrink-0 text-slate-400">{new Date(a.createdAt).toLocaleString("en-US")}</span>
                    <span className="w-24 shrink-0 font-semibold text-teal-800">{a.actorType}</span>
                    <span className="font-semibold text-slate-800">{a.action}</span>
                    <span className="truncate text-slate-400">{a.entity}{a.entityId ? `:${a.entityId.slice(0, 8)}` : ""} {a.ip && a.ip !== "sandbox" ? `· ${a.ip}` : ""}</span>
                  </div>
                ))}
                {data.audit.length === 0 && <p className="p-6 font-sans text-sm text-slate-400">No audit events yet.</p>}
              </CardContent>
            </Card>
      )}

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

                {detail.flags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fraud & review flags</p>
                    <div className="mt-2 space-y-2">
                      {detail.flags.map((f) => (
                        <div key={f.id} className={cn("rounded-lg border p-3", f.resolved ? "border-slate-200 opacity-60" : f.severity === "HIGH" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50")}>
                          <div className="flex items-center justify-between gap-2">
                            <FlagChip type={f.type} severity={f.severity} />
                            {!f.resolved && (
                              <Button size="sm" variant="outline" onClick={() => unflag(detail.id)}>
                                Mark reviewed
                              </Button>
                            )}
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{f.detail}</p>
                        </div>
                      ))}
                    </div>
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
                        Signed by <strong className="text-slate-700">{detail.response.signatureName}</strong> · {new Date(detail.response.signedAt).toLocaleString("en-US")} · identity: {detail.response.identityMethod} · took {Math.max(1, Math.round(detail.response.durationSeconds / 60))} min
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Answers</p>
                      <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                        {(JSON.parse(detail.response.answers || "[]") as { key: string; type: string; value: string | number | boolean | null; unableToObserve?: boolean }[]).map((a) => {
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
                      <Button asChild className="w-full bg-teal-700 hover:bg-teal-800">
                        <a href={`/api/pdf/${detail.id}`} target="_blank" rel="noreferrer">
                          <Download className="mr-1.5 h-4 w-4" /> Download branded PDF packet
                        </a>
                      </Button>
                    ) : (
                      <p className="text-center text-xs text-slate-400">Branded PDF packet generates automatically once this reference is signed.</p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">
                    Awaiting response — currently <StatusBadge status={detail.status} /> on day {detail.daysOpen}.
                    <br />
                    <span className="text-xs">Auto-reminders at day 2 · 5 · 9, link expires day {STATUS_META.EXPIRED ? "14" : "14"}.</span>
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

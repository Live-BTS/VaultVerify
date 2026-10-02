"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AgencyLogo, StatusBadge, SkillBadge, Spinner } from "./brand";
import { specialtyLabel, PROFICIENCY_META, STATUS_META } from "@/lib/bts/constants";
import { cn } from "@/lib/utils";
import { LogIn, Copy, ExternalLink, BellRing, RefreshCcw, Clock3, ShieldCheck } from "lucide-react";

interface ReqData {
  id: string;
  refName: string;
  refTitle: string;
  refEmail: string;
  refPhone: string;
  facilityName: string;
  status: string;
  sentAt: string;
  completedAt: string | null;
  expiresAt: string;
  reminderCount: number;
  refLink: string;
  callbackCode: string;
  response: { overallRating: number | null; remarks: string; skillsVerified: boolean } | null;
}

interface CandData {
  id: string;
  fullName: string;
  email: string;
  role: string;
  specialty: string;
  yearsExperience: number;
  city: string;
  state: string;
  requests: ReqData[];
  skills: { id: string; skillName: string; proficiency: string; highRisk: boolean }[];
  agency: { name: string; logoText: string; primaryColor: string; accentColor: string };
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function CandidateDashboard({ initialEmail, onSignOut, onOpenReference }: { initialEmail?: string; onSignOut: () => void; onOpenReference: (token: string) => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [candidate, setCandidate] = useState<CandData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (em: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate?email=${encodeURIComponent(em)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed");
      setCandidate(data.candidate);
      localStorage.setItem("bts_candidate_email", em);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = initialEmail ?? localStorage.getItem("bts_candidate_email");
    if (stored) {
      setEmail(stored);
      load(stored);
    }
  }, [load, initialEmail]);

  const nudge = async (requestId: string, refName: string) => {
    const res = await fetch("/api/candidate/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "nudge", requestId }),
    });
    const data = await res.json();
    if (res.ok) toast({ title: data.message ?? `Nudge sent to ${refName}` });
    else toast({ title: data.error ?? "Failed to send nudge", variant: "destructive" });
  };

  const swap = async (requestId: string, replacement: Record<string, string>) => {
    const res = await fetch("/api/candidate/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "swap", requestId, replacement }),
    });
    const data = await res.json();
    if (res.ok) {
      toast({ title: data.message ?? "Replacement request sent" });
      if (email) load(email);
    } else {
      toast({ title: data.error ?? "Swap failed", variant: "destructive" });
    }
  };

  // ── Sign-in gate ──
  if (!candidate) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <Card className="border-slate-200">
          <CardContent className="p-8">
            <div className="flex items-center gap-2 text-teal-700">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Nurse sign in</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter the email you used when creating your VaultVerify profile. (Sandbox: sign-in is a simple email lookup — production uses Supabase Auth.)
              Try the demo account: <button className="font-medium text-teal-700 underline" onClick={() => { setEmail("maya.rodriguez@example.com"); load("maya.rodriguez@example.com"); }}>maya.rodriguez@example.com</button>
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) load(email.trim());
              }}
            >
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5" required />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full bg-teal-700 hover:bg-teal-800">
                {loading ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <LogIn className="mr-1.5 h-4 w-4" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bothDone = candidate.requests.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <AgencyLogo logoText={candidate.agency.logoText} name={candidate.agency.name} />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{candidate.fullName}</span>
            <Button variant="ghost" size="sm" onClick={() => { localStorage.removeItem("bts_candidate_email"); onSignOut(); }}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Profile summary */}
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {candidate.fullName} <span className="font-normal text-slate-500">· {candidate.role}, {specialtyLabel(candidate.specialty)}</span>
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {candidate.yearsExperience} yrs · {candidate.city}, {candidate.state} · {bothDone}/{candidate.requests.length} references completed
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                <Clock3 className="h-3.5 w-3.5" />
                Auto-reminders at day 2 · 5 · 9
              </div>
            </div>
            {candidate.skills.length > 0 && (
              <div className="mt-4 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {candidate.skills.map((s) => (
                  <SkillBadge key={s.id} name={s.skillName} verified={false} proficiency={s.proficiency} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Requests */}
        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-slate-500">Your reference requests</h2>
        <div className="mt-3 space-y-4">
          {candidate.requests.map((r) => {
            const open = daysSince(r.sentAt);
            const done = r.status === "COMPLETED" || r.status === "FLAGGED";
            return (
              <Card key={r.id} className="border-slate-200">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{r.refName} <span className="font-normal text-slate-500">· {r.refTitle}</span></p>
                      <p className="text-sm text-slate-600">{r.facilityName} · {r.refEmail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {!done && <Badge variant="outline" className="text-slate-500">Day {open}</Badge>}
                    </div>
                  </div>

                  {done && r.response && (
                    <p className="mt-3 text-sm text-slate-700">
                      Completed{r.response.overallRating != null && <> — average rating <strong>{r.response.overallRating.toFixed(1)}/5</strong></>}
                      {r.status === "FLAGGED" && <span className="ml-1 text-rose-600">(under review)</span>}. Recruiter can download the branded packet.
                    </p>
                  )}

                  {!done && open >= 10 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      It&apos;s been {open} days. Consider nudging {r.refName.split(" ")[0]} or swapping in a different reference.
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!done && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => nudge(r.id, r.refName)}>
                          <BellRing className="mr-1.5 h-3.5 w-3.5" /> Nudge
                        </Button>
                        <SwapDialog onSwap={(repl) => swap(r.id, repl)} />
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-500"
                      onClick={() => {
                        navigator.clipboard?.writeText(r.refLink).then(() => toast({ title: "Link copied" }));
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button size="sm" variant="ghost" className="text-teal-700" onClick={() => onOpenReference(r.refLink.split("r=")[1])}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open form (demo as reference)
                    </Button>
                    {!done && (
                      <span className="ml-auto rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-600" title="Reference uses this over the phone for identity verification">
                        Callback code: {r.callbackCode}
                      </span>
                    )}
                  </div>
                  {!done && r.reminderCount > 0 && (
                    <p className="mt-2 text-xs text-slate-400">{r.reminderCount} automated reminder{r.reminderCount > 1 ? "s" : ""} sent · link expires {new Date(r.expiresAt).toLocaleDateString("en-US")}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Statuses: {Object.entries(STATUS_META).map(([k, v]) => v.label).join(" → ")} · notifications are simulated in the sandbox
        </p>
      </main>
    </div>
  );
}

function SwapDialog({ onSwap }: { onSwap: (replacement: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const [repl, setRepl] = useState({ refName: "", refTitle: "", refEmail: "", refPhone: "", facilityName: "", relationship: "Direct supervisor" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Swap reference
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Swap in a new reference</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">The old request is withdrawn (they&apos;ll get a polite no-action notice) and a fresh secure link goes out to this person.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input value={repl.refName} onChange={(e) => setRepl({ ...repl, refName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={repl.refTitle} onChange={(e) => setRepl({ ...repl, refTitle: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={repl.refEmail} onChange={(e) => setRepl({ ...repl, refEmail: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={repl.refPhone} onChange={(e) => setRepl({ ...repl, refPhone: e.target.value })} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>Facility</Label>
            <Input value={repl.facilityName} onChange={(e) => setRepl({ ...repl, facilityName: e.target.value })} className="mt-1" />
          </div>
        </div>
        <Button
          className="w-full bg-teal-700 hover:bg-teal-800"
          onClick={() => {
            onSwap(repl);
            setOpen(false);
          }}
        >
          Send replacement request
        </Button>
      </DialogContent>
    </Dialog>
  );
}

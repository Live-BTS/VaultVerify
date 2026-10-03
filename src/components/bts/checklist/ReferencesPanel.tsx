"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { specialtyLabel } from "@/lib/bts/constants";
import { Spinner, StatusBadge } from "../brand";
import { BellRing, Copy, ExternalLink, RefreshCcw, Send, UserPlus, UserRound, Users } from "lucide-react";
import type { ChangeEvent } from "react";

const RELATIONSHIPS = ["Direct supervisor", "Charge nurse / team lead", "Peer colleague on same unit", "Educator / preceptor", "Other working relationship"];

// ── References section of the nurse portal ──
// Bridges the reference-verification half of the product (Candidate + ReferenceRequest)
// into the signed-in nurse vault, matched by the account email.

interface RefReq {
  id: string;
  refName: string;
  refTitle: string;
  refEmail: string;
  refPhone: string;
  facilityName: string;
  relationship: string;
  status: string;
  sentAt: string;
  completedAt: string | null;
  expiresAt: string;
  reminderCount: number;
  refLink: string;
  callbackCode: string;
  response: { overallRating: number | null; skillsVerified: boolean; remarks: string } | null;
}

interface RefCandidate {
  id: string;
  fullName: string;
  role: string;
  specialty: string;
  yearsExperience: number;
  city: string;
  state: string;
  requests: RefReq[];
}

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const tokenFromLink = (link: string) => link.split("?r=")[1] ?? "";

export function ReferencesPanel({ email, fallbackName, onLaunchSetup, onStats }: {
  email: string;
  fallbackName: string;
  onLaunchSetup: () => void;
  onStats?: (s: { total: number; completed: number } | null) => void;
}) {
  const { toast } = useToast();
  const [candidate, setCandidate] = useState<RefCandidate | null>(null);
  const [state, setState] = useState<"loading" | "none" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/candidate?email=${encodeURIComponent(email)}`);
      const d = await res.json();
      if (res.status === 404) {
        setCandidate(null);
        setState("none");
        onStats?.(null);
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "Could not load references");
      const c: RefCandidate = d.candidate;
      setCandidate(c);
      setState("ready");
      onStats?.({ total: c.requests.length, completed: c.requests.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED").length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load references");
      setState("error");
    }
  }, [email, onStats]);

  useEffect(() => { load(); }, [load]);

  const nudge = async (requestId: string, refName: string) => {
    const res = await fetch("/api/candidate/actions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "nudge", requestId }),
    });
    const d = await res.json();
    if (res.ok) toast({ title: d.message ?? `Nudge sent to ${refName}` });
    else toast({ title: d.error ?? "Failed to send nudge", variant: "destructive" });
  };

  const swap = async (requestId: string, replacement: Record<string, string>) => {
    const res = await fetch("/api/candidate/actions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "swap", requestId, replacement }),
    });
    const d = await res.json();
    if (res.ok) {
      toast({ title: d.message ?? "Replacement request sent" });
      load();
    } else {
      toast({ title: d.error ?? "Swap failed", variant: "destructive" });
    }
  };

  const addRef = async (reference: Record<string, string>) => {
    const res = await fetch("/api/candidate/actions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_reference", email, reference }),
    });
    const d = await res.json();
    if (res.ok) {
      toast({ title: d.message ?? "Request sent" });
      load();
    } else {
      toast({ title: d.error ?? "Could not add reference", variant: "destructive" });
    }
  };

  if (state === "loading") {
    return <div className="flex justify-center py-16"><Spinner label="Loading your references…" /></div>;
  }

  if (state === "error") {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
        <p className="text-sm font-medium text-rose-600">{error}</p>
        <Button size="sm" variant="outline" onClick={load} className="mt-4">Try again</Button>
      </div>
    );
  }

  if (state === "none") {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
        <Users className="mx-auto h-8 w-8 text-verify-ink/60" />
        <p className="mt-3 text-sm font-semibold text-jade-ink">No reference profile yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-jade-muted">
          VaultVerify verifies your experience with two professional references. Launch setup, add your references, and each one
          receives a secure SMS + email link — they sign off within 14 days and the verified results land right here in your vault.
        </p>
        <div className="mx-auto mt-5 grid max-w-lg gap-2 text-left text-xs text-jade-muted sm:grid-cols-3">
          {[
            ["1", "Add 2 references", "Supervisor or charge nurse who saw your practice firsthand"],
            ["2", "They sign securely", "Identity-checked form with a signature and audit trail"],
            ["3", "Results land here", "Verified references live next to your skill checklists"],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-xl border border-vault-border bg-white p-3">
              <p className="flex items-center gap-1.5 font-semibold text-verify-ink"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-verify-green/20 text-[10px] font-bold">{n}</span> {t}</p>
              <p className="mt-1 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
        <Button onClick={onLaunchSetup} className="mt-6 bg-verify-green text-vault-dark hover:bg-verify-green/90">
          <UserRound className="mr-1.5 h-4 w-4" /> Set up references
        </Button>
        <p className="mt-3 text-[11px] text-[#8aa29c]">Setup pre-fills your details from this account ({email}).</p>
      </div>
    );
  }

  const done = candidate!.requests.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED").length;

  return (
    <div className="mt-6 space-y-4">
      {/* profile strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
        <div>
          <p className="text-base font-semibold text-jade-ink">
            {candidate!.fullName} <span className="font-normal text-jade-muted">· {candidate!.role}{candidate!.specialty ? `, ${specialtyLabel(candidate!.specialty)}` : ""}</span>
          </p>
          <p className="mt-1 text-xs text-jade-muted">
            {candidate!.yearsExperience} yrs experience{candidate!.city ? ` · ${candidate!.city}, ${candidate!.state}` : ""} · {done}/{candidate!.requests.length} references completed
          </p>
        </div>
        <span className="rounded-lg border border-verify-green/30 bg-verify-green/10 px-3 py-1.5 text-[11px] font-medium text-verify-ink">
          Auto-reminders at day 2 · 5 · 9
        </span>
      </div>

      <div className="flex justify-end">
        <AddReferenceDialog onAdd={addRef} />
      </div>

      {/* request cards */}
      {candidate!.requests.map((r) => {
        const open = daysSince(r.sentAt);
        const isDone = r.status === "COMPLETED" || r.status === "FLAGGED";
        return (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-jade-ink">{r.refName} <span className="font-normal text-jade-muted">· {r.refTitle}</span></p>
                <p className="mt-0.5 text-sm text-jade-muted">{r.facilityName} · {r.refEmail}{r.relationship ? ` · ${r.relationship}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                {!isDone && <span className="rounded-full border border-vault-border px-2.5 py-0.5 text-xs text-jade-muted">Day {open}</span>}
              </div>
            </div>

            {isDone && r.response && (
              <p className="mt-3 text-sm text-jade-ink">
                Completed{r.response.overallRating != null && <> — average rating <strong>{r.response.overallRating.toFixed(1)}/5</strong></>}
                {r.response.skillsVerified && <span className="ml-2 rounded-full border border-verify-green/40 bg-verify-green/10 px-2 py-0.5 text-[11px] font-semibold text-verify-ink">Skills verified</span>}
                {r.status === "FLAGGED" && <span className="ml-1 text-rose-600">(under review)</span>}
                <span className="block text-xs text-jade-muted">Signed {r.completedAt ? fmt(r.completedAt) : ""} · the recruiter can download the branded packet.</span>
              </p>
            )}

            {!isDone && open >= 10 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                It&apos;s been {open} days. Consider nudging {r.refName.split(" ")[0]} or swapping in a different reference.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!isDone && (
                <>
                  <Button size="sm" variant="outline" onClick={() => nudge(r.id, r.refName)} className="border-vault-border text-jade-ink hover:bg-verify-green/10">
                    <BellRing className="mr-1.5 h-3.5 w-3.5" /> Nudge
                  </Button>
                  <SwapDialog onSwap={(repl) => swap(r.id, repl)} />
                </>
              )}
              <Button size="sm" variant="ghost" className="text-jade-muted hover:text-jade-ink"
                onClick={() => navigator.clipboard?.writeText(r.refLink).then(() => toast({ title: "Link copied" }))}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
              </Button>
              <Button size="sm" variant="ghost" className="text-verify-ink hover:text-verify-deep"
                onClick={() => window.open(`/?r=${tokenFromLink(r.refLink)}`, "_blank")}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open form
              </Button>
              {!isDone && (
                <span className="ml-auto rounded-md bg-[#f0f6f2] px-2.5 py-1 font-mono text-xs text-[#33565b]" title="Reference uses this over the phone for identity verification">
                  Callback code: {r.callbackCode}
                </span>
              )}
            </div>
            {!isDone && r.reminderCount > 0 && (
              <p className="mt-2 text-xs text-[#8aa29c]">{r.reminderCount} automated reminder{r.reminderCount > 1 ? "s" : ""} sent · link expires {fmt(r.expiresAt)}</p>
            )}
          </motion.div>
        );
      })}

      <p className="text-center text-[11px] text-[#8aa29c]">
        References are matched to this vault by your account email ({email}).
      </p>
    </div>
  );
}

function SwapDialog({ onSwap }: { onSwap: (replacement: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const [repl, setRepl] = useState({ refName: "", refTitle: "", refEmail: "", refPhone: "", facilityName: "", relationship: "Direct supervisor" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Swap reference
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Swap in a new reference</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-jade-muted">The old request is withdrawn (they get a polite no-action notice) and a fresh secure link goes out to this person.</p>
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
        <Button className="w-full bg-verify-green text-vault-dark hover:bg-verify-green/90"
          onClick={() => { onSwap(repl); setOpen(false); }}>
          Send replacement request
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AddReferenceDialog({ onAdd }: { onAdd: (reference: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState({ refName: "", refTitle: "", refEmail: "", refPhone: "", facilityName: "", facilityCity: "", facilityState: "", relationship: "Direct supervisor", workStartDate: "", workEndDate: "" });
  const field = (k: keyof typeof ref) => ({
    value: ref[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setRef((r) => ({ ...r, [k]: e.target.value })),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add a reference
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add another reference</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-jade-muted">They&apos;ll receive a branded SMS + email with a secure link that expires in 14 days.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Name *</Label>
            <Input {...field("refName")} placeholder="Daniel Okafor" className="mt-1" />
          </div>
          <div>
            <Label>Title *</Label>
            <Input {...field("refTitle")} placeholder="ICU Nurse Manager" className="mt-1" />
          </div>
          <div>
            <Label>Work email *</Label>
            <Input type="email" {...field("refEmail")} placeholder="d.okafor@hospital.org" className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input {...field("refPhone")} placeholder="(312) 555-0177" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>Facility *</Label>
            <Input {...field("facilityName")} placeholder="St. Mary's Medical Center" className="mt-1" />
          </div>
          <div>
            <Label>City</Label>
            <Input {...field("facilityCity")} className="mt-1" />
          </div>
          <div>
            <Label>State</Label>
            <Input {...field("facilityState")} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>Working relationship *</Label>
            <select {...field("relationship")} className="mt-1 w-full rounded-md border border-vault-border bg-white px-3 py-2 text-sm text-jade-ink">
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <Label>Start (month/year)</Label>
            <Input {...field("workStartDate")} placeholder="2023-06" className="mt-1" />
          </div>
          <div>
            <Label>End (blank = current)</Label>
            <Input {...field("workEndDate")} placeholder="present" className="mt-1" />
          </div>
        </div>
        <Button className="w-full bg-verify-green text-vault-dark hover:bg-verify-green/90"
          onClick={() => { onAdd(ref); setOpen(false); setRef({ ...ref, refName: "", refTitle: "", refEmail: "", refPhone: "" }); }}>
          <Send className="mr-1.5 h-4 w-4" /> Send secure request
        </Button>
      </DialogContent>
    </Dialog>
  );
}

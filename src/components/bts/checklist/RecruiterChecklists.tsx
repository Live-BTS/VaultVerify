"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { specialtyLabel } from "@/lib/bts/checklistShared";
import { Spinner } from "../brand";
import { Check, ClipboardList, Download, Eye, Send, UserRoundX } from "lucide-react";

// ── Recruiter "Checklists" panel — send a checklist request to a candidate ──
// Recruiter fills the basic details (name + email required; profession / job
// title / specialty optional — the candidate completes anything left blank).
// Once the candidate completes it, the recruiter views & downloads it here.

interface InviteRow {
  id: string; candidateName: string; candidateEmail: string;
  profession: string; jobTitle: string; specialty: string; specialtyLabel: string;
  recruiterName: string; facilityName: string; status: string;
  createdAt: string; completedAt: string | null; claimUrl: string | null;
  completion: { candidateName: string; candidateTitle: string; jobTitle: string; specialtyLabel: string; yearsExperience: number; completedAt: string; expiresAt: string } | null;
}

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function RecruiterChecklists({ code, recruiterName }: { code: string; recruiterName: string }) {
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [form, setForm] = useState({ candidateName: "", candidateEmail: "", profession: "Nursing", jobTitle: "RN", specialty: "", facilityName: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ claimUrl: string | null; claimedByAccount: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action: "list" }) });
      const d = await res.json();
      if (d.ok) setRows(d.invites);
    } catch { /* keep old rows */ }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/checklist/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "send", ...form, recruiterName }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Send failed");
      setSent({ claimUrl: d.invite?.claimUrl ?? null, claimedByAccount: !!d.claimedByAccount });
      setForm({ ...form, candidateName: "", candidateEmail: "", specialty: "", facilityName: "", message: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally { setSending(false); }
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Send form */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Send className="h-4 w-4 text-teal-700" /> Send a checklist</h2>
        <p className="mt-1 text-xs text-slate-500">Name and email are all you need — the candidate fills in anything you leave blank during their self-assessment.</p>
        <form onSubmit={send} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ci-name">Candidate name *</Label>
              <Input id="ci-name" required value={form.candidateName} onChange={(e) => setForm({ ...form, candidateName: e.target.value })} placeholder="Emma Chen" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ci-email">Candidate email *</Label>
              <Input id="ci-email" required type="email" value={form.candidateEmail} onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })} placeholder="emma@example.com" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ci-title">Job title</Label>
              <Input id="ci-title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="RN" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ci-spec">Specialty</Label>
              <Input id="ci-spec" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Leave blank — candidate picks" className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="ci-fac">Facility (optional)</Label>
            <Input id="ci-fac" value={form.facilityName} onChange={(e) => setForm({ ...form, facilityName: e.target.value })} placeholder="St. Mary Medical Center" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ci-msg">Note to the candidate (optional)</Label>
            <Input id="ci-msg" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Needed before the ICU placement on the 14th" className="mt-1" />
          </div>
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <Button type="submit" disabled={sending} className="w-full bg-teal-700 hover:bg-teal-800">
            {sending ? "Sending…" : "Send checklist request"} <Send className="ml-2 h-4 w-4" />
          </Button>
          {sent && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
              {sent.claimedByAccount || !sent.claimUrl ? (
                <p className="flex items-center gap-1.5 font-medium"><Check className="h-3.5 w-3.5" /> Delivered — the candidate already has an account, it's in their Invites tab.</p>
              ) : (
                <>
                  <p className="font-medium">Invite created. Share the claim link with the candidate:</p>
                  <p className="mt-1 break-all rounded bg-white/70 p-2 font-mono text-[11px]">{sent.claimUrl}</p>
                </>
              )}
            </div>
          )}
        </form>
      </motion.div>

      {/* Invites list */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><ClipboardList className="h-4 w-4 text-teal-700" /> Sent checklists</h2>
        {!rows && <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-10"><Spinner /></div>}
        {rows?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No checklists sent yet. Send your first request — the candidate completes it once and it's reusable for a year.
          </div>
        )}
        {rows?.map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {r.candidateName} <span className="ml-1 text-xs font-normal text-slate-500">{r.candidateEmail}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.status === "COMPLETED" && r.completion
                    ? `${r.completion.specialtyLabel} · ${r.completion.yearsExperience} yr · completed ${fmt(r.completion.completedAt)} · valid until ${fmt(r.completion.expiresAt)}`
                    : `${r.specialty ? specialtyLabel(r.specialty) : "Specialty TBD"} · sent ${fmt(r.createdAt)}`}
                </p>
              </div>
              {r.status === "COMPLETED" && r.completion ? (
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800"><Check className="h-3 w-3" /> Completed</span>
                  <a href={`/api/checklist/pdf?invite=${r.id}&code=${encodeURIComponent(code)}`} download>
                    <Button size="sm" variant="outline" className="border-teal-200 text-teal-800 hover:bg-teal-50"><Download className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
                  </a>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <UserRoundX className="h-3 w-3" /> Waiting for candidate
                </span>
              )}
            </div>
            {r.status !== "COMPLETED" && r.claimUrl && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
                <Eye className="h-3 w-3 shrink-0" /> Candidate hasn't claimed it yet —
                <a href={r.claimUrl} className="font-mono text-teal-700 underline">{r.claimUrl}</a>
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

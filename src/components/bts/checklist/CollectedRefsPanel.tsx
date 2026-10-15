"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link2, ChevronDown, Clock3, Copy, Mail, Plus, RefreshCw, Star, UserCheck, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHARE_PRESETS, shareAccessLabel } from "@/lib/bts/constants";
import { Label } from "@/components/ui/label";

// ── CollectedRefsPanel — candidate "Collect reference" section ──
// The candidate adds their own manager/supervisor/any-title referees once.
// Completed references stay on the profile and are reusable by any recruiter,
// so references are never re-disturbed for every placement.

interface Ref {
  id: string;
  refName: string;
  refTitle: string;
  refEmail: string;
  facility: string;
  status: string;
  relationship: string;
  yearsKnown: number | null;
  wouldRehire: string;
  overallRating: number | null;
  answers: string;
  signatureName: string;
  completedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

const TITLES = ["Manager", "Supervisor", "Director", "Charge Nurse", "Educator", "Preceptor", "HR", "Peer", "Other"];

const REHIRE_LABEL: Record<string, string> = {
  YES: "Would rehire — without hesitation",
  WITH_RESERVATION: "Would rehire — with reservation",
  NO: "Would not rehire",
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export function CollectedRefsPanel() {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [refName, setRefName] = useState("");
  const [refTitle, setRefTitle] = useState("Manager");
  const [refEmail, setRefEmail] = useState("");
  const [facility, setFacility] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<Ref | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checklist/reference");
      const d = await res.json();
      if (d.ok) setRefs(d.refs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!refName.trim() || !refEmail.trim()) {
      setMsg({ kind: "err", text: "Name and email are required." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checklist/reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", refName, refTitle, refEmail, facility }),
      });
      const d = await res.json();
      if (!d.ok) {
        setMsg({ kind: "err", text: d.error ?? "Could not send the request." });
      } else {
        setMsg({ kind: "ok", text: `Request emailed to ${refEmail}. In production this goes via Brevo; in the sandbox the link is logged and copyable.` });
        setRefName("");
        setRefEmail("");
        setFacility("");
        setAdding(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async (id: string) => {
    await fetch("/api/checklist/reference", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resend", id }),
    });
    setMsg({ kind: "ok", text: "Reminder email sent." });
  };

  const copyLink = (r: Ref) => {
    navigator.clipboard?.writeText(`${window.location.origin}/?cr=`).catch(() => {});
    setMsg({ kind: "ok", text: "Base link copied — append the token shown in the sandbox email log." });
  };

  const completed = refs.filter((r) => r.status === "COMPLETED");
  const pending = refs.filter((r) => r.status === "PENDING");

  return (
    <div className="space-y-4">
      {/* explainer + stats */}
      <div className="rounded-2xl border border-vault-border bg-white p-5 vv-card-shadow sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-vault-border bg-verify-green/10 text-verify-ink">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-jade-ink">Collect references — once, reusable everywhere</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-jade-muted">
                Add your manager, supervisor, or any set title as a referee. They answer once on a secure single-use link and the verified
                reference stays on your profile — recruiters never disturb your referees again for every placement.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-verify-green/50 bg-verify-green/10 px-3 py-1.5 text-xs font-semibold text-verify-ink">
              <UserCheck className="h-3.5 w-3.5" /> {completed.length} verified
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-vault-border bg-white px-3 py-1.5 text-xs font-semibold text-jade-muted">
              <Clock3 className="h-3.5 w-3.5" /> {pending.length} waiting
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-verify-green px-4 py-2.5 text-sm font-semibold text-vault-teal-deep shadow-[0_4px_16px_-6px_rgba(124,193,24,0.7)] transition-colors hover:bg-verify-mint"
            >
              <Plus className="h-4 w-4" /> Collect a reference
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl border border-vault-border bg-white px-4 py-2.5 text-sm font-semibold text-jade-muted hover:text-jade-ink"
            >
              Cancel
            </button>
          )}
        </div>

        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
            <div className="mt-4 grid gap-3 rounded-xl border border-vault-border bg-[#fafcf9] p-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-jade-ink">
                Referee full name *
                <input value={refName} onChange={(e) => setRefName(e.target.value)} placeholder="e.g. Jordan Rivera" className="mt-1 w-full rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green" />
              </label>
              <label className="text-sm font-medium text-jade-ink">
                Title / relationship *
                <select value={refTitle} onChange={(e) => setRefTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green">
                  {TITLES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-jade-ink">
                Work email *
                <input value={refEmail} onChange={(e) => setRefEmail(e.target.value)} type="email" placeholder="name@facility.org" className="mt-1 w-full rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green" />
              </label>
              <label className="text-sm font-medium text-jade-ink">
                Facility <span className="font-normal text-jade-muted">(optional)</span>
                <input value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="e.g. St. Anthony Hospital" className="mt-1 w-full rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green" />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={create}
                  className="inline-flex items-center gap-2 rounded-xl bg-verify-green px-4 py-2.5 text-sm font-semibold text-vault-teal-deep transition-colors hover:bg-verify-mint disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Send secure reference request"}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {msg && (
          <p className={cn("mt-3 rounded-xl border px-3.5 py-2.5 text-sm", msg.kind === "ok" ? "border-verify-green/40 bg-verify-green/[0.08] text-verify-ink" : "border-red-200 bg-red-50 text-red-700")}>
            {msg.text}
          </p>
        )}
      </div>

      {/* list */}
      {loading ? (
        <p className="py-8 text-center text-sm text-jade-muted">Loading your references…</p>
      ) : refs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-jade-muted" />
          <p className="mt-3 text-sm font-medium text-jade-ink">No references collected yet</p>
          <p className="mt-1 text-sm text-jade-muted">Add your first referee above — one verified reference backs every future application.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {refs.map((r) => (
            <div key={r.id} className="rounded-2xl border border-vault-border bg-white vv-card-shadow">
              <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold", r.status === "COMPLETED" ? "border-verify-green/50 bg-verify-green/10 text-verify-ink" : r.status === "EXPIRED" ? "border-vault-border bg-jade-ink/5 text-jade-muted" : "border-vault-border bg-white text-jade-muted")}>
                  {r.status === "COMPLETED" ? <UserCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-jade-ink">
                    {r.refName} <span className="font-normal text-jade-muted">· {r.refTitle}</span>
                  </p>
                  <p className="truncate text-xs text-jade-muted">
                    {r.refEmail}{r.facility ? ` · ${r.facility}` : ""} · {r.status === "COMPLETED" ? `completed ${fmt(r.completedAt)}` : r.status === "EXPIRED" ? "link expired" : `sent ${fmt(r.createdAt)} — waiting`}
                  </p>
                </div>
                {r.status === "COMPLETED" && r.overallRating != null && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-verify-green/50 bg-verify-green/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-verify-ink">
                    <Star className="h-3 w-3" /> {r.overallRating.toFixed(1)}
                  </span>
                )}
                {r.status === "PENDING" && (
                  <button type="button" onClick={() => resend(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-white px-3 py-1.5 text-xs font-semibold text-jade-muted hover:border-verify-green/60 hover:text-verify-ink">
                    <RefreshCw className="h-3 w-3" /> Resend
                  </button>
                )}
                {r.status === "COMPLETED" && (
                  <>
                    <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-white px-3 py-1.5 text-xs font-semibold text-jade-muted hover:border-verify-green/60 hover:text-verify-ink">
                      {open === r.id ? "Hide" : "View"} <ChevronDown className={cn("h-3 w-3 transition-transform", open === r.id && "rotate-180")} />
                    </button>
                    <button type="button" onClick={() => setShareFor(r)} className="inline-flex items-center gap-1.5 rounded-lg bg-verify-green px-3 py-1.5 text-xs font-bold text-vault-teal-deep hover:bg-verify-mint">
                      <Link2 className="h-3 w-3" /> Share
                    </button>
                  </>
                )}
                {r.status !== "COMPLETED" && (
                  <button type="button" onClick={() => copyLink(r)} title="Copy link (sandbox testing)" className="inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-white px-2.5 py-1.5 text-xs font-semibold text-jade-muted hover:text-jade-ink">
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>

              {open === r.id && r.status === "COMPLETED" && (
                <div className="border-t border-vault-border bg-[#fafcf9] p-4 sm:p-5">
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <p><span className="text-jade-muted">Relationship:</span> <strong className="text-jade-ink">{r.relationship || "—"}</strong></p>
                    <p><span className="text-jade-muted">Years worked together:</span> <strong className="text-jade-ink">{r.yearsKnown ?? "—"}</strong></p>
                    <p><span className="text-jade-muted">Rehire:</span> <strong className="text-jade-ink">{REHIRE_LABEL[r.wouldRehire] ?? "—"}</strong></p>
                  </div>
                  {(() => {
                    try {
                      const a = JSON.parse(r.answers || "{}") as { ratings?: Record<string, number>; strengths?: string; comments?: string };
                      const anchors = Object.entries(a.ratings ?? {});
                      return (
                        <>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {anchors.map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1 rounded-full border border-vault-border bg-white px-2.5 py-1 text-[11px] text-jade-muted">
                                {k} <strong className="text-verify-ink">{v}/5</strong>
                              </span>
                            ))}
                          </div>
                          {a.strengths && <p className="mt-3 text-sm text-jade-muted"><span className="font-medium text-jade-ink">Strengths:</span> {a.strengths}</p>}
                          {a.comments && <p className="mt-1.5 text-sm text-jade-muted"><span className="font-medium text-jade-ink">Comments:</span> {a.comments}</p>}
                        </>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-jade-muted/80">E-signed: {r.signatureName || "—"} · immutable audit trail</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* share-a-reference dialog (same access rules as checklist links) */}
      {shareFor && <RefShareDialog refRow={shareFor} onClose={() => setShareFor(null)} />}
    </div>
  );
}

// ── RefShareDialog — hand out a controlled link to a completed reference ──
function RefShareDialog({ refRow, onClose }: { refRow: Ref; onClose: () => void }) {
  const [preset, setPreset] = useState<string>("ONE_TIME");
  const [customDays, setCustomDays] = useState("30");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<{ token: string; accessType: string; durationDays: number | null; expiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const chosen = SHARE_PRESETS.find((p) => p.key === preset)!;
      const accessType = chosen.key === "ONE_TIME" ? "ONE_TIME" : "DURATION";
      const durationDays = chosen.key === "ONE_TIME" ? null : chosen.key === "custom" ? Number(customDays) : chosen.days;
      const res = await fetch("/api/checklist/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createRef", collectedRefId: refRow.id, accessType, durationDays, label }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Could not create the link");
      setCreated(d.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
    } finally { setBusy(false); }
  };

  const link = created ? `${window.location.origin}/?s=${created.token}` : "";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b2b30]/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-md rounded-2xl border border-vault-border bg-white vv-card-shadow p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-jade-ink"><Link2 className="h-4 w-4 text-verify-ink" /> Share reference</h3>
            <p className="mt-0.5 text-xs text-jade-muted">{refRow.refName} · {refRow.refTitle}{refRow.facility ? ` · ${refRow.facility}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-jade-muted hover:bg-jade-ink/5 hover:text-jade-ink"><X className="h-4 w-4" /></button>
        </div>

        {!created ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-jade-muted">Who can open it &amp; for how long</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SHARE_PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => setPreset(p.key)}
                  className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    preset === p.key ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                  <span className="block font-semibold">{p.label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-75">
                    {p.key === "ONE_TIME" ? "Viewed once, then dead" : p.key === "custom" ? "You pick the days" : p.days === 1 ? "24 hours" : `${p.days} days from now`}
                  </span>
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="mt-3">
                <Label className="text-jade-ink/80">Days the link stays open</Label>
                <input type="number" min={1} max={365} value={customDays} onChange={(e) => setCustomDays(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm text-jade-ink outline-none focus:border-verify-green" />
              </div>
            )}
            <div className="mt-3">
              <Label className="text-jade-ink/80">Note for the recipient (optional)</Label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. For the SNF recruiter"
                className="mt-1 w-full rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm text-jade-ink outline-none focus:border-verify-green" />
            </div>
            {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
            <button type="button" disabled={busy} onClick={create}
              className="mt-4 w-full rounded-xl bg-verify-green px-4 py-2.5 text-sm font-bold text-vault-teal-deep transition-colors hover:bg-verify-mint disabled:opacity-50">
              {busy ? "Creating…" : "Create secure link"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 rounded-xl border border-verify-green/40 bg-verify-green/[0.08] px-3.5 py-2.5 text-sm text-verify-ink">
              Link ready — {shareAccessLabel({ accessType: created.accessType, durationDays: created.durationDays })}.
              Manage it anytime from <strong>Controlled sharing</strong>.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-vault-border bg-[#f0f6f2] px-3.5 py-2.5">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-jade-ink">{link}</p>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(link).then(() => setCopied(true)); }}
                className="shrink-0 rounded-lg bg-verify-green px-3 py-1.5 text-xs font-bold text-vault-teal-deep hover:bg-verify-mint">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-vault-border px-4 py-2.5 text-sm font-semibold text-jade-muted hover:text-jade-ink">
              Done
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

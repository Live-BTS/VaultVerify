"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VaultMark, Spinner } from "../brand";
import {
  Ban, CalendarClock, Check, ClipboardList, Clock3, Copy, Eye, Hourglass,
  KeyRound, Link2, PlusCircle, Timer, UserCheck,
} from "lucide-react";

// ── ControlledSharingPanel — candidate "Controlled sharing" section ──
// One place to see EVERY link the candidate has handed out — completed
// skills checklists AND completed collected references — with who it was
// for, what access it grants, how often it was opened, and one-click
// Revoke / Extend controls.

interface ShareRow {
  id: string;
  token: string;
  type: "CHECKLIST" | "REFERENCE";
  assetLabel: string;
  assetSub: string;
  assetValidUntil: string | null;
  accessType: string; // ONE_TIME | DURATION
  durationDays: number | null;
  label: string;
  recipientEmail?: string | null;
  audience?: "SPECIFIC" | "ANYONE";
  createdAt: string;
  expiresAt: string | null;
  viewedAt: string | null;
  viewCount: number;
  revoked: boolean;
}

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function statusOf(l: ShareRow): { key: "active" | "used" | "expired" | "revoked"; label: string } {
  if (l.revoked) return { key: "revoked", label: "Revoked" };
  if (l.accessType === "ONE_TIME") return l.viewedAt ? { key: "used", label: "Viewed once" } : { key: "active", label: "One-time · unopened" };
  if (l.expiresAt && new Date(l.expiresAt) < new Date()) return { key: "expired", label: "Expired" };
  return { key: "active", label: "Active" };
}

const STATUS_STYLE: Record<string, string> = {
  active: "border-verify-green/50 bg-verify-green/10 text-verify-ink",
  used: "border-amber-300 bg-amber-50 text-amber-700",
  expired: "border-vault-border bg-jade-ink/5 text-jade-muted",
  revoked: "border-rose-200 bg-rose-50 text-rose-600 line-through",
};

export function ControlledSharingPanel({ onGoShare }: { onGoShare: (tab: "mine" | "refs") => void }) {
  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/checklist/share", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listMine" }),
    });
    const d = await res.json();
    if (d.ok) {
      setRows([...(d.checklistLinks ?? []), ...(d.refLinks ?? [])]);
    } else {
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (row: ShareRow, action: "revoke" | "extend", days?: number) => {
    setBusyId(row.id);
    setMsg(null);
    try {
      const res = await fetch("/api/checklist/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: row.id, type: row.type, days }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Action failed");
      setMsg({
        kind: "ok",
        text: action === "revoke"
          ? "Access revoked — the link is dead immediately. Anyone who already viewed or downloaded the report keeps their copy."
          : `Access extended — the link is now valid until ${fmt(d.expiresAt)}.`,
      });
      setConfirmRevoke(null);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusyId(null);
    }
  };

  const copy = (l: ShareRow) => {
    navigator.clipboard?.writeText(`${window.location.origin}/?s=${l.token}`).then(() => {
      setMsg({ kind: "ok", text: "Link copied to your clipboard." });
    }).catch(() => {
      setMsg({ kind: "err", text: "Couldn't copy — select the link text manually." });
    });
  };

  const checklistRows = rows?.filter((r) => r.type === "CHECKLIST") ?? [];
  const refRows = rows?.filter((r) => r.type === "REFERENCE") ?? [];
  const activeCount = rows?.filter((r) => statusOf(r).key === "active").length ?? 0;

  const Row = ({ l }: { l: ShareRow }) => {
    const st = statusOf(l);
    const dead = st.key !== "active";
    const canExtend = l.accessType === "DURATION" && st.key !== "revoked";
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-2xl border border-vault-border bg-white vv-card-shadow">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
            l.type === "CHECKLIST" ? "border-vault-border bg-verify-green/10 text-verify-ink" : "border-vault-border bg-teal-500/10 text-teal-700")}>
            {l.type === "CHECKLIST" ? <ClipboardList className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-jade-ink">
              {l.type === "CHECKLIST" ? l.assetLabel : <><span className="text-jade-muted">Reference — </span>{l.assetLabel}</>}
            </p>
            <p className="truncate text-xs text-jade-muted">
              {l.assetSub}
              {l.audience === "SPECIFIC" && l.recipientEmail && <> · for <span className="font-medium text-jade-ink">{l.recipientEmail}</span> only</>}
              {l.audience === "ANYONE" && <> · anyone with the link</>}
              {l.label && <> · “{l.label}”</>}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-jade-muted/90">
              <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> created {fmt(l.createdAt)}</span>
              {l.accessType === "ONE_TIME"
                ? <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {l.viewedAt ? `opened ${fmt(l.viewedAt)}` : "not opened yet"}</span>
                : <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" /> {st.key === "expired" ? "was valid" : "valid"} until {fmt(l.expiresAt)}</span>}
              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {l.viewCount} view{l.viewCount === 1 ? "" : "s"}</span>
            </p>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", STATUS_STYLE[st.key])}>
            {st.key === "active" && l.accessType === "DURATION" ? <Timer className="h-3 w-3" /> : st.key === "revoked" ? <Ban className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
            {st.label}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => copy(l)} title="Copy link"
              className="inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-white px-2.5 py-1.5 text-xs font-semibold text-jade-muted hover:border-verify-green/60 hover:text-verify-ink">
              <Copy className="h-3 w-3" /> Copy
            </button>
            {canExtend && (
              <>
                <button type="button" disabled={busyId === l.id} onClick={() => act(l, "extend", 7)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-white px-2.5 py-1.5 text-xs font-semibold text-jade-muted hover:border-verify-green/60 hover:text-verify-ink disabled:opacity-50">
                  <PlusCircle className="h-3 w-3" /> +7 days
                </button>
                <button type="button" disabled={busyId === l.id} onClick={() => act(l, "extend", 30)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-white px-2.5 py-1.5 text-xs font-semibold text-jade-muted hover:border-verify-green/60 hover:text-verify-ink disabled:opacity-50">
                  <CalendarClock className="h-3 w-3" /> +30 days
                </button>
              </>
            )}
            {!dead && (confirmRevoke === l.id ? (
              <span className="flex items-center gap-1">
                <span className="mr-1 hidden max-w-[190px] text-right text-[10px] leading-tight text-rose-500 sm:inline">
                  Future visits fail. Copies already viewed or downloaded stay with the recipient.
                </span>
                <button type="button" disabled={busyId === l.id} onClick={() => act(l, "revoke")}
                  className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                  Confirm
                </button>
                <button type="button" onClick={() => setConfirmRevoke(null)} className="rounded-lg border border-vault-border px-2 py-1.5 text-xs text-jade-muted hover:text-jade-ink">
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmRevoke(l.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                <Ban className="h-3 w-3" /> Revoke
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  const GroupHeader = ({ icon: Icon, title, sub, count }: { icon: typeof ClipboardList; title: string; sub: string; count: number }) => (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-verify-ink" />
      <h3 className="text-sm font-bold text-jade-ink">{title} <span className="ml-1 rounded-full bg-jade-ink/5 px-2 py-0.5 text-[11px] font-semibold text-jade-muted">{count}</span></h3>
      <p className="hidden text-xs text-jade-muted sm:inline">— {sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* explainer */}
      <div className="rounded-2xl border border-vault-border bg-white p-5 vv-card-shadow sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-vault-border bg-verify-green/10 text-verify-ink">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-jade-ink">Controlled sharing — you decide who sees what, and for how long</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-jade-muted">
                Every link you hand out — skills checklists and collected references — lives here. Revoke access instantly,
                extend it when a placement runs long, and see exactly how many times each link was opened.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-verify-green/50 bg-verify-green/10 px-3 py-1.5 text-xs font-semibold text-verify-ink">
            <Check className="h-3.5 w-3.5" /> {activeCount} active link{activeCount === 1 ? "" : "s"}
          </span>
        </div>
        {msg && (
          <p className={cn("mt-3 rounded-xl border px-3.5 py-2.5 text-sm", msg.kind === "ok" ? "border-verify-green/40 bg-verify-green/[0.08] text-verify-ink" : "border-red-200 bg-red-50 text-red-700")}>
            {msg.text}
          </p>
        )}
      </div>

      {rows === null ? (
        <div className="flex justify-center rounded-2xl border border-vault-border bg-white vv-card-shadow p-10"><Spinner /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
          <Hourglass className="mx-auto h-8 w-8 text-jade-muted" />
          <p className="mt-3 text-sm font-medium text-jade-ink">Nothing shared yet</p>
          <p className="mt-1 text-sm text-jade-muted">Share a completed checklist or a collected reference and every link will appear here with full control.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => onGoShare("mine")} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">Share a checklist</Button>
            <Button size="sm" variant="ghost" onClick={() => onGoShare("refs")} className="border border-vault-border text-jade-muted hover:text-jade-ink">Share a reference</Button>
          </div>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <GroupHeader icon={ClipboardList} title="Skills checklists" sub="shared self-assessments" count={checklistRows.length} />
            {checklistRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-6 text-center">
                <p className="text-sm text-jade-muted">No checklist links yet — share one from <button type="button" className="font-semibold text-verify-ink underline" onClick={() => onGoShare("mine")}>My checklists</button>.</p>
              </div>
            ) : checklistRows.map((l) => <Row key={l.id} l={l} />)}
          </section>

          <section className="space-y-3">
            <GroupHeader icon={UserCheck} title="Collected references" sub="shared referee verifications" count={refRows.length} />
            {refRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-6 text-center">
                <p className="text-sm text-jade-muted">No reference links yet — share one from <button type="button" className="font-semibold text-verify-ink underline" onClick={() => onGoShare("refs")}>References</button>.</p>
              </div>
            ) : refRows.map((l) => <Row key={l.id} l={l} />)}
          </section>
        </>
      )}

      <p className="flex items-center justify-center gap-2 pt-2 text-[11px] text-jade-muted/80">
        <VaultMark size={14} /> Revoking is instant and permanent — the recipient sees &quot;link was revoked by the candidate&quot;. Copies already viewed or downloaded cannot be recalled.
      </p>
    </div>
  );
}

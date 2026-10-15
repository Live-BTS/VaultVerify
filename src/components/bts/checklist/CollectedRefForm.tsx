"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ClipboardList, Clock, MailX, ShieldCheck, UserRound } from "lucide-react";
import { VaultMark } from "@/components/bts/brand";
import { cn } from "@/lib/utils";

// ── CollectedRefForm — public referee form for candidate-collected references ──
// Opened via the secure single-use email link /?cr=<token>. The referee confirms
// their relationship, rates six competency anchors 1–5, answers rehire + comments
// and e-signs. The completed reference is stored on the candidate's profile.

interface Context {
  candidateName: string;
  candidateTitle: string;
  refName: string;
  refTitle: string;
  facility: string;
  expiresAt: string;
}
type Anchor = { key: string; label: string };

const SCALE = [
  { v: 1, l: "Limited" },
  { v: 2, l: "Developing" },
  { v: 3, l: "Competent" },
  { v: 4, l: "Strong" },
  { v: 5, l: "Exceptional" },
];

const RELATIONSHIPS = ["Manager", "Supervisor", "Director", "Charge Nurse", "Educator", "Preceptor", "HR", "Peer", "Other"];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CollectedRefForm({ token, onExit }: { token: string; onExit: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "done">("loading");
  const [reason, setReason] = useState("");
  const [ctx, setCtx] = useState<Context | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [error, setError] = useState("");
  const [relationship, setRelationship] = useState("");
  const [yearsKnown, setYearsKnown] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [wouldRehire, setWouldRehire] = useState("");
  const [strengths, setStrengths] = useState("");
  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/checklist/reference", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "preview", token }),
        });
        const d = await res.json();
        if (!d.ok) {
          setReason(d.reason ?? "invalid");
          setState("ready");
          return;
        }
        setCtx(d.context);
        setAnchors(d.anchors ?? []);
        setRelationship(d.context?.refTitle && RELATIONSHIPS.includes(d.context.refTitle) ? d.context.refTitle : "");
        setState("ready");
      } catch {
        setReason("invalid");
        setState("ready");
      }
    })();
  }, [token]);

  const rated = Object.keys(ratings).length;
  const canSubmit = state === "ready" && relationship && rated > 0 && wouldRehire && signature.trim().length > 1;

  const submit = async () => {
    if (!canSubmit) return;
    setState("submitting");
    setError("");
    try {
      const res = await fetch("/api/checklist/reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          token,
          relationship,
          yearsKnown: yearsKnown === "" ? null : Number(yearsKnown),
          ratings,
          wouldRehire,
          strengths,
          comments,
          signatureName: signature,
        }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error ?? "Submit failed");
        setState("ready");
        return;
      }
      setState("done");
    } catch {
      setError("Network error — please try again");
      setState("ready");
    }
  };

  return (
    <div className="vv-page flex min-h-screen flex-col text-jade-ink">
      {/* branded top bar */}
      <header className="border-b border-vault-border bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <VaultMark size={28} />
            <span className="text-sm font-bold tracking-tight">
              Vault<span className="text-verify-ink">Verify</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-vault-border bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-jade-muted">
            <ShieldCheck className="h-3 w-3 text-verify-ink" /> secure single-use link
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {state === "loading" && (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-jade-muted">Loading your reference form…</div>
        )}

        {state === "ready" && reason && (
          <div className="rounded-2xl border border-vault-border bg-white p-10 text-center vv-card-shadow">
            <MailX className="mx-auto h-10 w-10 text-jade-muted" />
            <h1 className="mt-4 text-xl font-semibold">
              {reason === "completed" ? "Reference already completed" : reason === "expired" ? "This link has expired" : "Link not valid"}
            </h1>
            <p className="mt-2 text-sm text-jade-muted">
              {reason === "completed"
                ? "You already submitted this reference — thank you! The candidate can see it in their vault."
                : "Secure links are single-use and time-limited. Ask the candidate to send a fresh request if you still need to respond."}
            </p>
            <button type="button" onClick={onExit} className="mt-6 rounded-xl border border-vault-border bg-white px-5 py-2.5 text-sm font-semibold text-jade-ink hover:border-verify-green/60">
              Back to home
            </button>
          </div>
        )}

        {state === "ready" && !reason && ctx && (
          <>
            {/* context card */}
            <div className="rounded-2xl border border-vault-border bg-white p-6 vv-card-shadow sm:p-7">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-vault-border bg-verify-green/10 text-verify-ink">
                  <UserRound className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-verify-ink">Reference request</p>
                  <h1 className="mt-1 text-xl font-semibold leading-snug">
                    {ctx.refName ? `${ctx.refName}, ` : ""}confirm {ctx.candidateName}&apos;s clinical performance
                  </h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-jade-muted">
                    {ctx.candidateName} ({ctx.candidateTitle}) listed you as their <strong className="text-jade-ink">{ctx.refTitle}</strong>
                    {ctx.facility ? ` at ${ctx.facility}` : ""}. Your answers are e-signed and stored in their verified vault — it takes about 3 minutes.
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-jade-muted">
                    <Clock className="h-3 w-3" /> link expires {new Date(ctx.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
            </div>

            {/* form */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mt-4 space-y-4">
              {/* 1 · relationship */}
              <section className="rounded-2xl border border-vault-border bg-white p-6 vv-card-shadow">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-verify-ink">1 · Your role</p>
                <h2 className="mt-1.5 text-base font-semibold">What was your working relationship?</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RELATIONSHIPS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRelationship(r)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                        relationship === r
                          ? "border-verify-green bg-verify-green/15 text-verify-ink"
                          : "border-vault-border bg-white text-jade-muted hover:border-verify-green/50 hover:text-jade-ink"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block text-sm font-medium text-jade-ink">
                  How many years did you work with {ctx.candidateName.split(" ")[0]}? <span className="font-normal text-jade-muted">(optional)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={yearsKnown}
                    onChange={(e) => setYearsKnown(e.target.value)}
                    placeholder="e.g. 3"
                    className="mt-1.5 w-40 rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green"
                  />
                </label>
              </section>

              {/* 2 · competency anchors */}
              <section className="rounded-2xl border border-vault-border bg-white p-6 vv-card-shadow">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-verify-ink">2 · Competency check</p>
                <h2 className="mt-1.5 text-base font-semibold">Rate each area from 1–5</h2>
                <div className="mt-4 space-y-4">
                  {anchors.map((a) => (
                    <div key={a.key}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-jade-ink">{a.label}</p>
                        <span className={cn("font-mono text-[10px] uppercase tracking-wider", ratings[a.key] ? "text-verify-ink" : "text-jade-muted/70")}>
                          {ratings[a.key] ? `${ratings[a.key]} / 5` : "not rated"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-5 gap-1.5">
                        {SCALE.map((s) => (
                          <button
                            key={s.v}
                            type="button"
                            onClick={() => setRatings((p) => ({ ...p, [a.key]: s.v }))}
                            title={s.l}
                            className={cn(
                              "rounded-lg border py-2 text-xs font-semibold transition-all",
                              ratings[a.key] === s.v
                                ? "border-verify-green bg-verify-green/15 text-verify-ink shadow-[0_2px_10px_-3px_rgba(124,193,24,0.6)]"
                                : "border-vault-border bg-white text-jade-muted hover:border-verify-green/50"
                            )}
                          >
                            {s.v}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-left text-[10px] text-jade-muted/80 sm:hidden">{SCALE[ratings[a.key] ? ratings[a.key] - 1 : 2]?.l}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3 · rehire */}
              <section className="rounded-2xl border border-vault-border bg-white p-6 vv-card-shadow">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-verify-ink">3 · The bottom line</p>
                <h2 className="mt-1.5 text-base font-semibold">Would you hire/work with {ctx.candidateName.split(" ")[0]} again?</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { v: "YES", l: "Yes, without hesitation" },
                    { v: "WITH_RESERVATION", l: "Yes, with reservation" },
                    { v: "NO", l: "No" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setWouldRehire(o.v)}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                        wouldRehire === o.v
                          ? "border-verify-green bg-verify-green/15 text-verify-ink"
                          : "border-vault-border bg-white text-jade-muted hover:border-verify-green/50 hover:text-jade-ink"
                      )}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block text-sm font-medium text-jade-ink">
                  Key strengths <span className="font-normal text-jade-muted">(optional)</span>
                  <textarea
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    rows={2}
                    placeholder="e.g. Precepted two new grads; excellent IV placement…"
                    className="mt-1.5 w-full resize-none rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-jade-ink">
                  Anything else the hiring team should know? <span className="font-normal text-jade-muted">(optional)</span>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full resize-none rounded-xl border border-vault-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-verify-green"
                  />
                </label>
              </section>

              {/* 4 · e-sign */}
              <section className="rounded-2xl border border-vault-border bg-white p-6 vv-card-shadow">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-verify-ink">4 · E-signature</p>
                <h2 className="mt-1.5 text-base font-semibold">Sign to verify your answers</h2>
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your full name"
                  className="mt-3 w-full rounded-xl border border-vault-border bg-white px-4 py-3 font-serif text-lg italic outline-none focus:border-verify-green"
                />
                <p className="mt-2 text-xs leading-relaxed text-jade-muted">
                  By typing your name you certify these answers reflect your honest professional assessment. Timestamped and stored in the audit trail.
                </p>
                {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
                <motion.button
                  type="button"
                  disabled={!canSubmit || state === "submitting"}
                  whileHover={canSubmit ? { scale: 1.01 } : undefined}
                  whileTap={canSubmit ? { scale: 0.98 } : undefined}
                  onClick={submit}
                  className={cn(
                    "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-colors sm:w-auto",
                    canSubmit
                      ? "bg-verify-green text-vault-teal-deep shadow-[0_6px_24px_-8px_rgba(124,193,24,0.8)] hover:bg-verify-mint"
                      : "cursor-not-allowed bg-jade-ink/10 text-jade-muted"
                  )}
                >
                  <ClipboardList className="h-4 w-4" />
                  {state === "submitting" ? "Sealing in the vault…" : "Submit verified reference"}
                </motion.button>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-jade-muted/80">{rated} / {anchors.length || 6} anchors rated · rehire: {wouldRehire ? "set" : "—"}</p>
              </section>
            </motion.div>
          </>
        )}

        {state === "done" && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: EASE }} className="rounded-2xl border border-vault-border bg-white p-10 text-center vv-card-shadow">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.1 }}>
              <CheckCircle2 className="mx-auto h-14 w-14 text-verify-green" />
            </motion.div>
            <h1 className="mt-4 text-2xl font-semibold">Reference sealed in the vault</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-jade-muted">
              Thank you{signature ? `, ${signature.split(" ")[0]}` : ""} — your verified reference is now stored on {ctx?.candidateName ?? "the candidate"}&apos;s profile, ready to back every application without being asked again.
            </p>
            <button type="button" onClick={onExit} className="mt-6 rounded-xl border border-vault-border bg-white px-5 py-2.5 text-sm font-semibold text-jade-ink hover:border-verify-green/60">
              Done
            </button>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-vault-border bg-white/60 py-4 text-center text-xs text-jade-muted">
        VaultVerify · references, verified. Skills, proven.
      </footer>
    </div>
  );
}

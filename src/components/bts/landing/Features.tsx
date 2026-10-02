"use client";

import { motion } from "framer-motion";
import {
  Radar,
  Link2,
  BadgeCheck,
  ListChecks,
  FileText,
  History,
  Lock,
  Timer,
  Ban,
  ShieldCheck,
  CircleDot,
  Fingerprint,
  AlertTriangle,
  Smartphone,
  UserRound,
  FileCheck2,
} from "lucide-react";
import { GlowCard, SectionHeading, staggerParent, EASE_OUT } from "./Primitives";

/* ── mini visual building blocks ───────────────────────────── */

const PIPELINE = ["Sent", "Opened", "In progress", "Completed"];

function PipelineVisual() {
  return (
    <div className="mt-6">
      <div className="flex items-center">
        {PIPELINE.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.35 + i * 0.22, duration: 0.5, ease: EASE_OUT }}
            className="relative flex items-center"
          >
            <div className={i === 3 ? "rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300" : "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400"}>
              {i === 2 && <span className="animate-pulse-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle" />}
              {i === 3 && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />}
              {s}
            </div>
            {i < PIPELINE.length - 1 && (
              <div className="relative mx-2 h-px w-6 overflow-hidden bg-white/10 sm:w-10">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.55 + i * 0.22, duration: 0.45, ease: EASE_OUT }}
                  className="h-full w-full origin-left bg-gradient-to-r from-emerald-400/70 to-emerald-400"
                />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {[
          { name: "Dr. Amara Osei", role: "Unit Manager · St. Vincent ICU", status: "Completed · 4.6", ok: true },
          { name: "J. Rivera", role: "Charge Nurse · Bayview Med-Surg", status: "In progress · day 2 reminder sent", ok: false },
        ].map((r, i) => (
          <motion.div
            key={r.name}
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9 + i * 0.25, duration: 0.5, ease: EASE_OUT }}
            className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-300">
                {i === 0 ? <UserRound className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-200">{r.name}</p>
                <p className="font-mono text-[10px] text-zinc-500">{r.role}</p>
              </div>
            </div>
            <span className={r.ok ? "font-mono text-[10px] text-emerald-300" : "font-mono text-[10px] text-amber-300"}>{r.status}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TokenVisual() {
  return (
    <div className="mt-6">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate font-mono text-xs text-zinc-300">bts.link/r/9fK3xQ7v</span>
          <Lock className="ml-auto h-3 w-3 shrink-0 text-zinc-500" />
        </div>
        <div aria-hidden className="animate-shimmer pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-300/10 to-transparent" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {[
          [Timer, "Expires 14 days after send"],
          [Ban, "Single use — dead after submit"],
          [ShieldCheck, "Revoke or regenerate anytime"],
        ].map(([Icon, label], i) => {
          const I = Icon as typeof Timer;
          return (
            <li key={i} className="flex items-center gap-2.5 text-xs text-zinc-400">
              <I className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
              {label as string}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SKILL_ROWS = [
  { name: "Vent management", level: "Can teach", verified: true },
  { name: "Central lines", level: "Independent", verified: true },
  { name: "Titrating drips", level: "Supervised", verified: false },
];

function SkillsVisual() {
  return (
    <div className="mt-6 space-y-2.5">
      {SKILL_ROWS.map((s, i) => (
        <motion.div
          key={s.name}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 + i * 0.28, duration: 0.5, ease: EASE_OUT }}
          className={
            s.verified
              ? "flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3.5 py-3"
              : "flex items-center justify-between rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-3.5 py-3"
          }
        >
          <div>
            <p className="text-xs font-medium text-zinc-200">{s.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{s.level}</p>
          </div>
          <span
            className={
              s.verified
                ? "inline-flex items-center gap-1 rounded-md bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold text-emerald-300"
                : "inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-zinc-400"
            }
          >
            {s.verified ? <BadgeCheck className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
            {s.verified ? "Verified" : "Self"}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

const FLAGS = [
  { t: "Free-email + surname match", sev: "HIGH" },
  { t: "Duplicate IP across references", sev: "MEDIUM" },
  { t: "Completed in 58 seconds", sev: "HIGH" },
];

function FraudVisual() {
  return (
    <div className="mt-6 grid items-center gap-6 sm:grid-cols-[150px_1fr]">
      {/* radar */}
      <div className="relative mx-auto flex h-[150px] w-[150px] items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-rose-400/15" />
        <div className="absolute inset-4 rounded-full border border-rose-400/20" />
        <div className="absolute inset-9 rounded-full border border-rose-400/25" />
        <div aria-hidden className="animate-radar absolute inset-0 rounded-full border border-rose-400/40" />
        <div aria-hidden className="animate-radar absolute inset-0 rounded-full border border-rose-400/30" style={{ animationDelay: "1.3s" }} />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-400/10 text-rose-300">
          <Fingerprint className="h-5 w-5" />
        </div>
      </div>
      {/* flags */}
      <div className="space-y-2.5">
        {FLAGS.map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.45 + i * 0.3, duration: 0.5, ease: EASE_OUT }}
            className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className={f.sev === "HIGH" ? "h-3.5 w-3.5 text-rose-300" : "h-3.5 w-3.5 text-amber-300"} />
              <span className="text-xs text-zinc-300">{f.t}</span>
            </div>
            <span
              className={
                f.sev === "HIGH"
                  ? "rounded-md bg-rose-400/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-rose-300"
                  : "rounded-md bg-amber-400/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-amber-300"
              }
            >
              {f.sev}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const SPECIALTIES = ["ICU", "Med-Surg", "ER", "Tele", "L&D", "OR", "PACU", "Peds", "Behavioral", "LTC"];

function SpecialtiesVisual() {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {SPECIALTIES.map((s, i) => (
        <motion.span
          key={s}
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: EASE_OUT }}
          className={
            i < 2
              ? "rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"
              : "rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-500"
          }
        >
          {s}
        </motion.span>
      ))}
    </div>
  );
}

function PacketVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.4, duration: 0.55, ease: EASE_OUT }}
      className="mt-6 overflow-hidden rounded-xl border border-white/10"
    >
      <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500/15 to-amber-500/10 px-3.5 py-2.5">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-400 text-[7px] font-bold text-emerald-950">MEDS</div>
        <span className="font-mono text-[10px] text-zinc-300">reference-packet.pdf</span>
        <FileCheck2 className="ml-auto h-3.5 w-3.5 text-emerald-300" />
      </div>
      <div className="space-y-2 bg-black/30 px-3.5 py-3">
        <div className="h-1.5 w-3/4 rounded-full bg-white/10" />
        <div className="h-1.5 w-1/2 rounded-full bg-white/[0.07]" />
        <div className="flex items-center gap-1.5 pt-1">
          {[1, 2, 3, 4, 5].map((p) => (
            <span key={p} className={p <= 5 ? "h-1.5 w-1.5 rounded-full bg-emerald-400/80" : "h-1.5 w-1.5 rounded-full bg-white/10"} />
          ))}
          <span className="ml-1 font-mono text-[10px] text-emerald-300">4.6</span>
        </div>
        <div className="h-1.5 w-2/3 rounded-full bg-white/[0.07]" />
      </div>
    </motion.div>
  );
}

const AUDIT_LINES = [
  "14:02 · FORM_OPENED · iPhone · US",
  "14:07 · IDENTITY_EMAIL_DOMAIN ✓",
  "14:09 · SIGNED · J. Rivera",
  "14:09 · PACKET_GENERATED",
];

function AuditVisual() {
  return (
    <div className="bts-scroll mt-6 overflow-hidden rounded-xl border border-white/10 bg-black/40 px-3.5 py-3">
      {AUDIT_LINES.map((l, i) => (
        <motion.p
          key={l}
          initial={{ opacity: 0, x: -14 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.35 + i * 0.3, duration: 0.45, ease: EASE_OUT }}
          className="truncate font-mono text-[10px] leading-relaxed text-zinc-400 [&_span]:text-emerald-400"
        >
          {i === 1 ? (
            <>
              14:07 · IDENTITY_EMAIL_DOMAIN <span className="text-emerald-400">✓</span>
            </>
          ) : (
            l.replace(" ✓", "")
          )}
        </motion.p>
      ))}
      <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">immutable · exportable</p>
    </div>
  );
}

/* ── the Bento section ─────────────────────────────────────── */

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-[120px]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Why BTS"
          title={
            <>
              Everything the paper form{" "}
              <span className="bg-gradient-to-r from-emerald-300 to-amber-300 bg-clip-text text-transparent">never had</span>
            </>
          }
          sub="Seven upgrades, shipped as one flow — each one attacks a defect of the PDF it replaces."
        />

        <motion.div
          variants={staggerParent(0.1, 0.15)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-90px" }}
          className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {/* Row 1 */}
          <GlowCard className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                <Smartphone className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">The two-party flow, finally digital</h3>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">
              The nurse builds a portable profile; managers answer ten anchored questions — one per screen — on any phone. No logins, no fax, no chasing signatures.
            </p>
            <PipelineVisual />
          </GlowCard>

          <GlowCard glow="amber">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                <Link2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">Single-use secure links</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Every invite is a signed token tied to one reference — nothing to forward, nothing to leak.
            </p>
            <TokenVisual />
          </GlowCard>

          {/* Row 2 */}
          <GlowCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                <ListChecks className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">Skills, proven — not claimed</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Self-rated levels become Manager-verified badges when a reference confirms them. Recruiters filter on truth.
            </p>
            <SkillsVisual />
          </GlowCard>

          <GlowCard glow="rose" className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 text-rose-300">
                <Radar className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">A fraud radar on every submission</h3>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">
              Identity checks and pattern detection run before a packet ever reaches a recruiter — suspicious pairs are surfaced automatically.
            </p>
            <FraudVisual />
          </GlowCard>

          {/* Row 3 */}
          <GlowCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">10 specialty templates</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Med-Surg and ICU are live today — eight more ship with the pilot, each with high-risk skills flagged for confirmation.
            </p>
            <SpecialtiesVisual />
          </GlowCard>

          <GlowCard glow="amber">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">Branded packets, zero assembly</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Every completion auto-generates a MEDS-branded PDF — ratings, remarks, skills badges and e-signature included.
            </p>
            <PacketVisual />
          </GlowCard>

          <GlowCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                <History className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50">Immutable audit trail</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Opens, identity checks, edits and signatures — timestamped, exportable, subpoena-friendly.
            </p>
            <AuditVisual />
          </GlowCard>
        </motion.div>
      </div>
    </section>
  );
}

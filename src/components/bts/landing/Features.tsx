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
            <div
              className={
                i === 3
                  ? "rounded-full border border-verify-green/40 bg-verify-green/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-verify-ink"
                  : "rounded-full border border-vault-border bg-[#f2f7f4] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-jade-muted"
              }
            >
              {i === 2 && <span className="animate-pulse-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-verify-mint align-middle" />}
              {i === 3 && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-verify-green align-middle" />}
              {s}
            </div>
            {i < PIPELINE.length - 1 && (
              <div className="relative mx-2 h-px w-6 overflow-hidden bg-[#d7e3df] sm:w-10">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.55 + i * 0.22, duration: 0.45, ease: EASE_OUT }}
                  className="h-full w-full origin-left bg-gradient-to-r from-verify-green/70 to-verify-green"
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
            className="flex items-center justify-between rounded-xl border border-vault-border/60 bg-[#f7faf8] px-3.5 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef4f1] text-[#33565b]">
                {i === 0 ? <UserRound className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-xs font-medium text-[#33565b]">{r.name}</p>
                <p className="font-mono text-[10px] text-[#7d938e]">{r.role}</p>
              </div>
            </div>
            <span className={r.ok ? "font-mono text-[10px] text-verify-ink" : "font-mono text-[10px] text-verify-ink"}>{r.status}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TokenVisual() {
  return (
    <div className="mt-6">
      <div className="relative overflow-hidden rounded-xl border border-vault-border bg-[#f0f6f2] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-verify-ink" />
          <span className="truncate font-mono text-xs text-jade-ink">vaultverify.link/r/9fK3xQ7v</span>
          <Lock className="ml-auto h-3 w-3 shrink-0 text-[#7d938e]" />
        </div>
        <div aria-hidden className="animate-shimmer pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-verify-green/10 to-transparent" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {[
          [Timer, "Expires 14 days after send"],
          [Ban, "Single use — dead after submit"],
          [ShieldCheck, "Revoke or regenerate anytime"],
        ].map(([Icon, label], i) => {
          const I = Icon as typeof Timer;
          return (
            <li key={i} className="flex items-center gap-2.5 text-xs text-jade-muted">
              <I className="h-3.5 w-3.5 shrink-0 text-verify-ink/85" />
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
              ? "flex items-center justify-between rounded-xl border border-verify-green/25 bg-verify-green/[0.06] px-3.5 py-3"
              : "flex items-center justify-between rounded-xl border border-dashed border-vault-border bg-[#f7faf8] px-3.5 py-3"
          }
        >
          <div>
            <p className="text-xs font-medium text-[#33565b]">{s.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#7d938e]">{s.level}</p>
          </div>
          <span
            className={
              s.verified
                ? "inline-flex items-center gap-1 rounded-md bg-verify-green/15 px-2 py-1 text-[10px] font-semibold text-verify-ink"
                : "inline-flex items-center gap-1 rounded-md bg-[#eef4f1] px-2 py-1 text-[10px] font-semibold text-jade-muted"
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
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
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
            className="flex items-center justify-between rounded-xl border border-vault-border/60 bg-[#f7faf8] px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className={f.sev === "HIGH" ? "h-3.5 w-3.5 text-rose-600" : "h-3.5 w-3.5 text-amber-600"} />
              <span className="text-xs text-[#33565b]">{f.t}</span>
            </div>
            <span
              className={
                f.sev === "HIGH"
                  ? "rounded-md bg-rose-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-rose-600"
                  : "rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-amber-600"
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
              ? "rounded-lg border border-verify-green/35 bg-verify-green/10 px-2.5 py-1 text-[11px] font-medium text-verify-ink"
              : "rounded-lg border border-vault-border bg-[#f2f7f4] px-2.5 py-1 text-[11px] text-jade-muted"
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
      className="mt-6 overflow-hidden rounded-xl border border-vault-border"
    >
      <div className="flex items-center gap-2 bg-gradient-to-r from-verify-green/15 to-[#2f8d99]/15 px-3.5 py-2.5">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-vault-teal-deep ring-1 ring-verify-green/40 text-[7px] font-bold text-verify-ink">VV</div>
        <span className="font-mono text-[10px] text-[#33565b]">reference-packet.pdf</span>
        <FileCheck2 className="ml-auto h-3.5 w-3.5 text-verify-ink" />
      </div>
      <div className="space-y-2 bg-[#f2f7f4] px-3.5 py-3">
        <div className="h-1.5 w-3/4 rounded-full bg-[#d7e3df]" />
        <div className="h-1.5 w-1/2 rounded-full bg-[#e2ece9]" />
        <div className="flex items-center gap-1.5 pt-1">
          {[1, 2, 3, 4, 5].map((p) => (
            <span key={p} className={p <= 5 ? "h-1.5 w-1.5 rounded-full bg-verify-green/85" : "h-1.5 w-1.5 rounded-full bg-[#d7e3df]"} />
          ))}
          <span className="ml-1 font-mono text-[10px] text-verify-ink">4.6</span>
        </div>
        <div className="h-1.5 w-2/3 rounded-full bg-[#e2ece9]" />
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
    <div className="vv-scroll mt-6 overflow-hidden rounded-xl border border-vault-border bg-[#f0f6f2] px-3.5 py-3">
      {AUDIT_LINES.map((l, i) => (
        <motion.p
          key={l}
          initial={{ opacity: 0, x: -14 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.35 + i * 0.3, duration: 0.45, ease: EASE_OUT }}
          className="truncate font-mono text-[10px] leading-relaxed text-jade-muted [&_span]:text-verify-ink"
        >
          {i === 1 ? (
            <>
              14:07 · IDENTITY_EMAIL_DOMAIN <span className="text-verify-ink">✓</span>
            </>
          ) : (
            l.replace(" ✓", "")
          )}
        </motion.p>
      ))}
      <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#7d938e]">immutable · exportable</p>
    </div>
  );
}

/* ── the Bento section ─────────────────────────────────────── */

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-verify-green/[0.05] blur-[120px]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Why VaultVerify"
          title={
            <>
              Everything the paper form{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-[#0d6b77] via-verify-green to-verify-mint bg-clip-text text-transparent">never had</span>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verify-green/25 bg-verify-green/10 text-verify-ink">
                <Smartphone className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">The two-party flow, finally digital</h3>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-jade-muted">
              The nurse builds a portable profile; managers answer ten anchored questions — one per screen — on any phone. No logins, no fax, no chasing signatures.
            </p>
            <PipelineVisual />
          </GlowCard>

          <GlowCard glow="mint">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verify-light/20 bg-verify-light/[0.07] text-jade-ink">
                <Link2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">Single-use secure links</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-jade-muted">
              Every invite is a signed token tied to one reference — nothing to forward, nothing to leak.
            </p>
            <TokenVisual />
          </GlowCard>

          {/* Row 2 */}
          <GlowCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verify-green/25 bg-verify-green/10 text-verify-ink">
                <ListChecks className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">Skills, proven — not claimed</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-jade-muted">
              Self-rated levels become Manager-verified badges when a reference confirms them. Recruiters filter on truth.
            </p>
            <SkillsVisual />
          </GlowCard>

          <GlowCard glow="jade" className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-100 text-rose-600">
                <Radar className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">A fraud radar on every submission</h3>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-jade-muted">
              Identity checks and pattern detection run before a packet ever reaches a recruiter — suspicious pairs are surfaced automatically.
            </p>
            <FraudVisual />
          </GlowCard>

          {/* Row 3 */}
          <GlowCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verify-green/25 bg-verify-green/10 text-verify-ink">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">10 specialty templates</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-jade-muted">
              Med-Surg and ICU are live today — eight more ship with the pilot, each with high-risk skills flagged for confirmation.
            </p>
            <SpecialtiesVisual />
          </GlowCard>

          <GlowCard glow="jade">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2f8d99]/30 bg-[#2f8d99]/10 text-[#2f8d99]">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">Branded packets, zero assembly</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-jade-muted">
              Every completion auto-generates a VaultVerify-branded PDF — ratings, remarks, skills badges and e-signature included.
            </p>
            <PacketVisual />
          </GlowCard>

          <GlowCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verify-green/25 bg-verify-green/10 text-verify-ink">
                <History className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-jade-ink">Immutable audit trail</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-jade-muted">
              Opens, identity checks, edits and signatures — timestamped, exportable, subpoena-friendly.
            </p>
            <AuditVisual />
          </GlowCard>
        </motion.div>
      </div>
    </section>
  );
}

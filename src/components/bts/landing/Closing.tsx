"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, ScanFace, Database, UserRound, LayoutDashboard, ChevronRight } from "lucide-react";
import { SectionHeading, GlowCard, GlowButton, AnimatedCounter, staggerParent, fadeUp } from "./Primitives";
import { VaultMark } from "../brand";

const TRUST = [
  {
    icon: ShieldCheck,
    t: "Candidate consent first",
    d: "A signed release is captured before any manager is ever contacted — protecting references, lifting response rates, and keeping every request defensible.",
    glow: "green" as const,
  },
  {
    icon: ScanFace,
    t: "Fraud patterns flagged",
    d: "Free-email surname matches, duplicate IPs across references, and sub-60-second completions are surfaced automatically with severity levels.",
    glow: "jade" as const,
  },
  {
    icon: Database,
    t: "Immutable audit trail",
    d: "Every view, edit, identity check, and signature is timestamped and stored against the record — with retention and deletion policies built in.",
    glow: "mint" as const,
  },
];

const METRICS = [
  { to: 86, suffix: "%", label: "Reference completion rate", note: "chased automatically with day 2/5/9 reminders" },
  { to: 48, prefix: "<", suffix: "h", label: "Target two-reference turnaround", note: "vs. 2–3 weeks on paper" },
  { to: 4, suffix: " min", label: "Average referee completion", note: "one question per screen, any phone" },
  { to: 55, suffix: "+", label: "Specialty skills templates", note: "across 10 healthcare disciplines" },
];

export function Trust() {
  return (
    <section id="trust" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Trust by design"
          title={
            <>
              Built for <span className="animate-gradient-text bg-gradient-to-r from-[#0d6b77] via-verify-green to-verify-mint bg-clip-text text-transparent">defensibility</span> from day one
            </>
          }
          sub="Healthcare hiring runs on trust. Every mechanic in VaultVerify exists to make the verification chain visible, provable, and audit-ready."
        />

        <motion.div
          variants={staggerParent(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-90px" }}
          className="mt-14 grid gap-4 md:grid-cols-3"
        >
          {TRUST.map((c) => (
            <GlowCard key={c.t} glow={c.glow}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-vault-border bg-[#f0f6f2] text-verify-ink">
                <c.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-jade-ink">{c.t}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-jade-muted">{c.d}</p>
            </GlowCard>
          ))}
        </motion.div>

        {/* metrics band */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="relative mt-6 overflow-hidden rounded-2xl border border-vault-border bg-gradient-to-br from-verify-green/[0.08] via-white to-[#2f8d99]/[0.06] p-8 vv-card-shadow sm:p-10"
        >
          <div aria-hidden className="bg-grid-light absolute inset-0 opacity-40" />
          <dl className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.label}>
                <dd className="bg-gradient-to-r from-[#03363d] to-verify-deep bg-clip-text text-4xl font-bold tracking-tight text-transparent">
                  <AnimatedCounter to={m.to} prefix={m.prefix ?? ""} suffix={m.suffix ?? ""} />
                </dd>
                <dt className="mt-2 text-sm font-medium text-[#33565b]">{m.label}</dt>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#7d938e]">{m.note}</p>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>
    </section>
  );
}

export function FinalCta({ onRole }: { onRole: (r: "candidate" | "recruiter" | "checklist") => void }) {
  return (
    <section id="cta" className="relative px-4 pb-24 sm:px-6 sm:pb-32">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-vault-teal-deep bg-gradient-to-b from-[#03363d] to-[#02272c] px-6 py-16 text-center shadow-[0_40px_90px_-30px_rgba(3,54,61,0.5)] sm:px-12 sm:py-20"
      >
        <div aria-hidden className="animate-breathe absolute -top-24 left-1/2 h-72 w-[480px] -translate-x-1/2 rounded-full bg-verify-green/20 blur-[100px]" />
        <div aria-hidden className="bg-grid-dark absolute inset-0 opacity-30" />

        <div className="relative">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-verify-green">Live · open for agencies and clinicians</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
            Ready to retire the <span className="animate-gradient-text bg-gradient-to-r from-[#7fd4de] via-verify-green to-verify-mint bg-clip-text text-transparent">paper reference form?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#9fc4bd]">
            Join the VaultVerify pilot — build your profile in minutes, or see the live recruiter pipeline with fraud flags and verified skill badges.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <GlowButton onClick={() => onRole("checklist")} className="px-7 py-3.5 text-base">
              <UserRound className="h-4 w-4" /> Start my skills checklist <ChevronRight className="h-4 w-4" />
            </GlowButton>
            <GlowButton variant="ghost" onClick={() => onRole("recruiter")} className="px-7 py-3.5 text-base">
              <LayoutDashboard className="h-4 w-4" /> Open recruiter dashboard
            </GlowButton>
          </div>
          <p className="mt-5 text-xs text-[#7fa39d]">
            Want manager-verified references instead?{" "}
            <button type="button" onClick={() => onRole("candidate")} className="font-semibold text-verify-green hover:underline">
              Start the reference flow →
            </button>
          </p>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7fa39d]">
            Email-verified accounts · Single-use secure links · Audit-ready records
          </p>
        </div>
      </motion.div>
    </section>
  );
}

export function Footer({ agencyName, onRole }: { agencyName: string; onRole?: (r: "candidate" | "recruiter" | "checklist") => void }) {
  const year = new Date().getFullYear();
  const portals: { label: string; role: "candidate" | "recruiter" | "checklist"; hint: string }[] = [
    { label: "Candidate sign in", role: "checklist", hint: "Skills checklists & references" },
    { label: "Recruiter sign in", role: "recruiter", hint: "Agency dashboard & pipeline" },
    { label: "Build my references", role: "candidate", hint: "Start the reference flow" },
  ];
  return (
    <footer className="mt-auto border-t border-vault-border bg-white/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        {/* brand */}
        <div>
          <div className="flex items-center gap-2.5">
            <VaultMark size={34} />
            <span className="text-sm font-semibold tracking-tight text-jade-ink">
              Vault<span className="text-verify-ink">Verify</span>
            </span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-jade-muted">
            Verified references and skills checklists for healthcare hiring — built for {agencyName === "VaultVerify" ? "agencies, candidates and referees" : agencyName}.
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-[#7d938e]">References, verified. Skills, proven.</p>
        </div>

        {/* portals */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-verify-ink/80">Portal</p>
          <ul className="mt-3 space-y-2.5">
            {onRole
              ? portals.map((p) => (
                  <li key={p.label}>
                    <button type="button" onClick={() => onRole(p.role)} className="text-left">
                      <span className="block text-xs font-medium text-jade-ink hover:text-verify-ink">{p.label}</span>
                      <span className="block text-[11px] text-[#7d938e]">{p.hint}</span>
                    </button>
                  </li>
                ))
              : null}
          </ul>
        </div>

        {/* legal + contact */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-verify-ink/80">Legal &amp; contact</p>
          <ul className="mt-3 space-y-2.5 text-xs">
            <li>
              <Link href="/terms" className="font-medium text-jade-ink hover:text-verify-ink">Terms &amp; Conditions</Link>
            </li>
            <li>
              <Link href="/privacy" className="font-medium text-jade-ink hover:text-verify-ink">Privacy Policy</Link>
            </li>
            <li>
              <a href="mailto:myzipvault@gmail.com" className="text-jade-muted hover:text-jade-ink">myzipvault@gmail.com</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-vault-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-[#7d938e] sm:flex-row sm:px-6">
          <span>© {year} {agencyName}. All rights reserved.</span>
          <span className="font-mono text-[10px] uppercase tracking-wider">Consent-gated · fraud-checked · audit-ready</span>
        </div>
      </div>
    </footer>
  );
}

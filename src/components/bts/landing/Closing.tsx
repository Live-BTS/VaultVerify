"use client";

import { motion } from "framer-motion";
import { ShieldCheck, ScanFace, Database, UserRound, LayoutDashboard, ChevronRight } from "lucide-react";
import { SectionHeading, GlowCard, GlowButton, AnimatedCounter, staggerParent, fadeUp } from "./Primitives";

const TRUST = [
  {
    icon: ShieldCheck,
    t: "Candidate consent first",
    d: "A signed release is captured before any manager is ever contacted — protecting references, lifting response rates, and keeping every request defensible.",
    glow: "emerald" as const,
  },
  {
    icon: ScanFace,
    t: "Fraud patterns flagged",
    d: "Free-email surname matches, duplicate IPs across references, and sub-60-second completions are surfaced automatically with severity levels.",
    glow: "rose" as const,
  },
  {
    icon: Database,
    t: "Immutable audit trail",
    d: "Every view, edit, identity check, and signature is timestamped and stored against the record — with retention and deletion policies built in.",
    glow: "amber" as const,
  },
];

const METRICS = [
  { to: 86, suffix: "%", label: "Reference completion rate", note: "target >70% for the pilot" },
  { to: 48, prefix: "<", suffix: "h", label: "Median two-reference turnaround", note: "vs. 2–3 weeks on paper" },
  { to: 4, suffix: " min", label: "Average manager completion", note: "one question per screen" },
  { to: 10, label: "Specialty skills templates", note: "Med-Surg + ICU live today" },
];

export function Trust() {
  return (
    <section id="trust" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Trust by design"
          title={
            <>
              Built for <span className="bg-gradient-to-r from-emerald-300 to-amber-300 bg-clip-text text-transparent">defensibility</span> from day one
            </>
          }
          sub="Healthcare hiring runs on trust. Every mechanic in BTS exists to make the verification chain visible, provable, and audit-ready."
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
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-emerald-300">
                <c.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-zinc-50">{c.t}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-zinc-400">{c.d}</p>
            </GlowCard>
          ))}
        </motion.div>

        {/* metrics band */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="relative mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-amber-500/[0.05] p-8 sm:p-10"
        >
          <div aria-hidden className="bg-grid-dark absolute inset-0 opacity-40" />
          <dl className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.label}>
                <dd className="bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
                  <AnimatedCounter to={m.to} prefix={m.prefix ?? ""} suffix={m.suffix ?? ""} />
                </dd>
                <dt className="mt-2 text-sm font-medium text-zinc-300">{m.label}</dt>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{m.note}</p>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>
    </section>
  );
}

export function FinalCta({ onRole }: { onRole: (r: "candidate" | "recruiter") => void }) {
  return (
    <section id="cta" className="relative px-4 pb-24 sm:px-6 sm:pb-32">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-b from-[#0B120E] to-[#070A08] px-6 py-16 text-center sm:px-12 sm:py-20"
      >
        <div aria-hidden className="animate-breathe absolute -top-24 left-1/2 h-72 w-[480px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[100px]" />
        <div aria-hidden className="bg-grid-dark absolute inset-0 opacity-30" />

        <div className="relative">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-emerald-400/90">Phase 1 · pilot open</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl sm:leading-[1.1]">
            Ready to retire the <span className="bg-gradient-to-r from-emerald-300 to-amber-300 bg-clip-text text-transparent">paper reference form?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400">
            Join the MEDS Talent pilot — build your profile in minutes, or see the live recruiter pipeline with fraud flags and verified skill badges.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <GlowButton onClick={() => onRole("candidate")} className="px-7 py-3.5 text-base">
              <UserRound className="h-4 w-4" /> Start as a nurse <ChevronRight className="h-4 w-4" />
            </GlowButton>
            <GlowButton variant="ghost" onClick={() => onRole("recruiter")} className="px-7 py-3.5 text-base">
              <LayoutDashboard className="h-4 w-4" /> Open recruiter dashboard
            </GlowButton>
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            Sandbox build · multi-tenant ready · Zipvault-compatible notifications
          </p>
        </div>
      </motion.div>
    </section>
  );
}

export function Footer({ agencyName }: { agencyName: string }) {
  return (
    <footer className="mt-auto border-t border-white/[0.05] bg-black/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6">
        <span>
          © {new Date().getFullYear()} {agencyName} · BTS Phase 1 — sandbox build
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider">References, verified. Skills, proven.</span>
      </div>
    </footer>
  );
}

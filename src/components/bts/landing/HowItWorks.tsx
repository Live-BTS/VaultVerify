"use client";

import { motion } from "framer-motion";
import { UserRound, BellRing, Smartphone, Fingerprint, FileCheck2 } from "lucide-react";
import { SectionHeading, staggerParent, fadeUp, EASE_OUT } from "./Primitives";

const STEPS = [
  { icon: UserRound, t: "Nurse builds a profile", d: "Specialty, role, and a self-rated skills checklist with recency — once, reused everywhere.", days: "Day 0" },
  { icon: BellRing, t: "Secure invites go out", d: "Branded SMS + email with no-login links that expire in 14 days.", days: "Day 0" },
  { icon: Smartphone, t: "Managers answer on mobile", d: "One question per screen, 5-point anchored scale, optional skills confirmation.", days: "Day 0–2" },
  { icon: Fingerprint, t: "Identity + fraud checks", d: "Employer-domain match, duplicate-IP and speed flags run automatically.", days: "Instant" },
  { icon: FileCheck2, t: "Branded packet lands", d: "PDF + structured data hit the recruiter pipeline; reminders fire at day 2/5/9.", days: "< 48h" },
];

export function HowItWorks() {
  return (
    <section id="flow" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Five steps between <span className="bg-gradient-to-r from-emerald-300 to-amber-300 bg-clip-text text-transparent">paper and packet</span>
            </>
          }
          sub="The whole loop a reference used to take three weeks to crawl — compressed into two days."
        />

        <div className="relative mt-16">
          {/* connector — draws itself on scroll into view */}
          <div aria-hidden className="absolute left-[27px] top-0 h-full w-px bg-white/[0.06] lg:left-0 lg:top-[27px] lg:h-px lg:w-full" />
          <motion.div
            aria-hidden
            initial={{ scaleY: 0, scaleX: 0 }}
            whileInView={{ scaleY: 1, scaleX: 1 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 1.6, ease: EASE_OUT }}
            className="absolute left-[27px] top-0 h-full w-px origin-top bg-gradient-to-b from-emerald-400/70 via-emerald-400/30 to-amber-300/50 lg:left-0 lg:top-[27px] lg:h-px lg:w-full lg:origin-left lg:bg-gradient-to-r"
          />

          <motion.ol
            variants={staggerParent(0.16)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-120px" }}
            className="grid gap-10 lg:grid-cols-5 lg:gap-6"
          >
            {STEPS.map((s, i) => (
              <motion.li key={s.t} variants={fadeUp} className="relative flex gap-5 lg:block">
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/25 bg-[#0A0D0B] text-emerald-300 shadow-[0_0_24px_-6px_rgba(52,211,153,0.4)]">
                  <s.icon className="h-6 w-6" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 font-mono text-[10px] font-bold text-emerald-950">
                    {i + 1}
                  </span>
                </div>
                <div className="lg:mt-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/80">{s.days}</p>
                  <h3 className="mt-1.5 text-sm font-semibold text-zinc-50 lg:text-base">{s.t}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 lg:text-[13px]">{s.d}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}

/* ── Specialty marquee strip ───────────────────────────────── */

const MARQUEE_ITEMS = ["Med-Surg", "ICU", "ER", "Telemetry", "Labor & Delivery", "OR", "PACU", "Pediatrics", "Behavioral Health", "Long-Term Care"];

export function SpecialtyMarquee() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <section aria-label="Supported specialties" className="relative overflow-hidden border-y border-white/[0.05] py-6">
      <div className="mask-fade-x">
        <div className="animate-marquee flex w-max items-center gap-3">
          {row.map((s, i) => (
            <span
              key={`${s}-${i}`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.07] bg-white/[0.02] px-4 py-1.5 text-xs text-zinc-400"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${i % 2 === 0 ? "bg-emerald-400/70" : "bg-amber-300/70"}`} />
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

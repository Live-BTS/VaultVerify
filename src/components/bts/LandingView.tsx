"use client";

import { motion, useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Hero } from "./landing/Hero";
import { Features } from "./landing/Features";
import { HowItWorks, SpecialtyMarquee } from "./landing/HowItWorks";
import { Trust, FinalCta, Footer } from "./landing/Closing";
import { GlowButton } from "./landing/Primitives";

export interface AgencyInfo {
  id: string;
  name: string;
  logoText: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
}

export type Role = "candidate" | "recruiter";

function Navbar({ logoText, name, onRole }: { logoText: string; name: string; onRole: (r: Role) => void }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <motion.header
      initial={{ y: reduce ? 0 : -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={
        "fixed inset-x-0 top-0 z-50 transition-colors duration-500 " +
        (scrolled ? "border-b border-white/[0.06] bg-[#050706]/85 backdrop-blur-xl" : "border-b border-transparent")
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400 text-xs font-bold tracking-tight text-emerald-950 shadow-[0_0_18px_-4px_rgba(52,211,153,0.7)]">
            {logoText.slice(0, 4)}
          </div>
          <span className="text-sm font-semibold text-zinc-100">{name}</span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {[
            ["Features", "#features"],
            ["How it works", "#flow"],
            ["Trust", "#trust"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="group relative text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-emerald-400 transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GlowButton variant="ghost" onClick={() => onRole("recruiter")} className="px-4 py-2 text-[13px]">
            Recruiter sign in
          </GlowButton>
          <GlowButton onClick={() => onRole("candidate")} className="px-4 py-2 text-[13px]">
            <ShieldCheck className="h-3.5 w-3.5" /> Nurse sign up
          </GlowButton>
        </div>
      </div>
    </motion.header>
  );
}

export function LandingView({
  agency,
  onRole,
}: {
  agency: AgencyInfo | null;
  onRole: (r: Role) => void;
  stats?: { completionRate: number; avgTimeHours: number } | null;
}) {
  const name = agency?.name ?? "MEDS Talent";
  return (
    <div id="top" className="bts-dark flex min-h-screen flex-col">
      <Navbar logoText={agency?.logoText ?? "MEDS"} name={name} onRole={onRole} />
      <main className="flex-1">
        <Hero agencyName={name} onRole={onRole} />
        <SpecialtyMarquee />
        <Features />
        <HowItWorks />
        <Trust />
        <FinalCta onRole={onRole} />
      </main>
      <Footer agencyName={name} />
    </div>
  );
}

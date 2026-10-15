"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";
import {
  ArrowRight,
  Ban,
  FileCheck2,
  LayoutDashboard,
  Link2,
  Lock,
  Radar,
  ShieldCheck,
  Timer,
  UserRound,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── VaultVerify locked motion language ──────────────────────
   spring micro-interactions · staggered scroll reveals · soft glow
   Light surface: off-white cream → mint white gradient (vv-page)
   ──────────────────────────────────────────────────────────── */
const SPRING = { type: "spring" as const, stiffness: 400, damping: 15 };
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const heroParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

const bentoParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.13 } },
};

type Role = "candidate" | "recruiter" | "checklist";

/* ── mini visual: cascade mapping (Profession → Discipline → Specialty) ── */

const CASCADE = [
  { k: "Profession", v: "Nursing", hot: false },
  { k: "Discipline", v: "RN", hot: false },
  { k: "Specialty", v: "Med-Surg", hot: true },
];

function MappingVisual() {
  return (
    <div className="mt-6">
      <div className="space-y-2">
        {CASCADE.map((row, i) => (
          <motion.div
            key={row.k}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.18, duration: 0.5, ease: EASE }}
            className={cn(
              "flex items-center justify-between rounded-xl border px-3.5 py-2.5",
              row.hot
                ? "border-verify-green/60 bg-verify-green/[0.08]"
                : "border-vault-border bg-white dark:border-jade-mist/50 dark:bg-night/70"
            )}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-jade-muted dark:text-fog">{row.k}</span>
            <span className={cn("text-xs font-semibold", row.hot ? "text-verify-ink dark:text-verify-mint" : "text-jade-ink dark:text-pearl")}>
              {row.v}
              {row.hot && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-verify-green align-middle shadow-[0_0_8px_rgba(124,193,24,0.8)]" />}
            </span>
          </motion.div>
        ))}
      </div>

      {/* auto-mapped template card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.85, duration: 0.55, ease: EASE }}
        className="mt-3 rounded-xl border border-vault-border bg-white p-3.5 vv-card-shadow dark:border-jade-mist/50 dark:bg-night/70 dark:vv-card-shadow-dark"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-verify-green/40 bg-verify-green/10 text-verify-ink dark:text-verify-mint">
            <FileCheck2 className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs font-semibold text-jade-ink dark:text-pearl">Medication Administration</p>
          <span className="ml-auto rounded-md border border-verify-green/40 bg-verify-green/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-verify-ink">
            auto-mapped
          </span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          <div className="h-1.5 w-4/5 rounded-full bg-jade-ink/[0.08] dark:bg-white/[0.08]" />
          <div className="h-1.5 w-3/5 rounded-full bg-jade-ink/[0.05] dark:bg-white/[0.05]" />
        </div>
        <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-jade-muted dark:text-fog">
          7 skills · 1–4 scale · N/A enabled · valid 30 days
        </p>
      </motion.div>
    </div>
  );
}

/* ── mini visual: live audit stream + pipeline ─────────────── */

const AUDIT_LINES = [
  "14:02 · CHECKLIST_OPENED · iPhone · US",
  "14:07 · SKILL_RATED · 4 — Proficient",
  "14:09 · E-SIGNED · J. Rivera",
  "14:09 · PACKET_GENERATED",
];

const PIPELINE = ["Sent", "Opened", "In progress", "Completed"];

function AuditVisual() {
  return (
    <div className="mt-6">
      <div className="rounded-xl border border-vault-border bg-white px-3.5 py-3 vv-card-shadow dark:border-jade-mist/50 dark:bg-night/70 dark:vv-card-shadow-dark">
        {AUDIT_LINES.map((l, i) => (
          <motion.p
            key={l}
            initial={{ opacity: 0, x: -14 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.26, duration: 0.45, ease: EASE }}
            className="truncate font-mono text-[10px] leading-relaxed text-jade-muted [&_span]:text-verify-ink dark:text-fog dark:[&_span]:text-verify-mint"
          >
            {i === 1 ? (
              <>
                14:07 · SKILL_RATED · <span>4 — Proficient</span>
              </>
            ) : i === 3 ? (
              <>
                14:09 · <span>PACKET_GENERATED</span>
              </>
            ) : (
              l
            )}
          </motion.p>
        ))}
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-jade-muted/80 dark:text-fog/80">live · immutable · exportable</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PIPELINE.map((s, i) => (
          <motion.span
            key={s}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.16, duration: 0.45, ease: EASE }}
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider",
              i === PIPELINE.length - 1
                ? "border-verify-green/60 bg-verify-green/10 text-verify-ink"
                : "border-vault-border bg-white text-jade-muted dark:border-jade-mist/50 dark:bg-night/70 dark:text-fog"
            )}
          >
            {i === PIPELINE.length - 2 && <span className="animate-pulse-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-verify-green align-middle" />}
            {i === PIPELINE.length - 1 && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-verify-green align-middle" />}
            {s}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/* ── mini visual: single-use token + expiry rules ──────────── */

function VaultVisual() {
  return (
    <div className="mt-6">
      <div className="relative overflow-hidden rounded-xl border border-vault-border bg-white px-3.5 py-3 vv-card-shadow dark:border-jade-mist/50 dark:bg-night/70 dark:vv-card-shadow-dark">
        <div className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-verify-ink dark:text-verify-mint" />
          <span className="truncate font-mono text-xs text-jade-ink dark:text-pearl">vaultverify.link/s/9fK3xQ7v</span>
          <Lock className="ml-auto h-3 w-3 shrink-0 text-jade-muted dark:text-fog" />
        </div>
        <div aria-hidden className="animate-shimmer pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-verify-green/[0.12] to-transparent" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          [Ban, "One-time burn"],
          [Timer, "7-day window"],
          [ShieldCheck, "Revoke anytime"],
        ].map(([Icon, label], i) => {
          const I = Icon as typeof Ban;
          return (
            <motion.span
              key={label as string}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + i * 0.16, duration: 0.45, ease: EASE }}
              className="inline-flex items-center gap-1.5 rounded-full border border-vault-border bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-jade-muted dark:border-jade-mist/50 dark:bg-night/70 dark:text-fog"
            >
              <I className="h-3 w-3 text-verify-ink dark:text-verify-mint" />
              {label as string}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Bento card: white + soft shadow + hover glow ──────────── */

function BentoCard({
  icon: Icon,
  title,
  copy,
  children,
}: {
  icon: typeof Waypoints;
  title: string;
  copy: string;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      variants={rise}
      whileHover={reduce ? undefined : { y: -6, scale: 1.02, transition: SPRING }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl",
        "border border-vault-border bg-white vv-card-shadow dark:border-jade-mist/60 dark:bg-vault-dark/60 dark:vv-card-shadow-dark",
        "transition-[border-color,box-shadow] duration-500",
        "hover:border-verify-green/60 hover:shadow-[0_24px_60px_-20px_rgba(124,193,24,0.4)]"
      )}
    >
      {/* soft brand wash + hover hairline */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(3,54,61,0.045),transparent_70%)] dark:bg-[radial-gradient(120%_70%_at_50%_0%,rgba(124,193,24,0.05),transparent_70%)]" />
      <div aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-verify-green/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative flex h-full flex-col p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-vault-border bg-verify-green/10 text-verify-ink dark:border-jade-mist/60 dark:text-verify-mint">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold leading-snug text-jade-ink dark:text-pearl">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-jade-muted dark:text-fog">{copy}</p>
        {children}
      </div>
    </motion.article>
  );
}

/* ── HeroSection: light cream landing hero + Bento grid ────── */

const STATS: Array<[string, string]> = [
  ["86%", "Completion rate"],
  ["<48h", "Median turnaround"],
  ["1 yr", "Checklist validity"],
  ["10", "Specialty templates"],
];

export function HeroSection({ agencyName, onRole }: { agencyName: string; onRole: (r: Role) => void }) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  // orbs drift on scroll for depth
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const orbY1 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 110]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section ref={sectionRef} className="relative overflow-hidden pb-20 pt-32 sm:pb-24 sm:pt-40">
        {/* soft radial backdrop on the cream gradient */}
        <div aria-hidden className="absolute inset-0">
          <div className="bg-grid-light mask-radial-hero absolute inset-0 dark:bg-grid-dark" />
          <motion.div style={{ y: orbY1 }} className="absolute left-[6%] top-[-180px] h-[460px] w-[460px] rounded-full bg-[#2f8d99]/[0.12] blur-[130px] dark:bg-[#2f8d99]/[0.18]" />
          <motion.div style={{ y: orbY2 }} className="absolute right-[2%] top-[120px] h-[400px] w-[400px] rounded-full bg-verify-green/[0.14] blur-[120px] dark:bg-verify-green/[0.12]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-verify-green/40 to-transparent" />
        </div>

        <motion.div variants={heroParent} initial="hidden" animate="show" className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
          <motion.div
            variants={rise}
            className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-vault-border bg-white/80 px-4 py-1.5 text-xs font-medium text-jade-muted shadow-sm backdrop-blur-md dark:border-jade-mist/60 dark:bg-vault-dark/60 dark:text-fog dark:shadow-none"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-verify-green" />
            </span>
            VaultVerify · Healthcare Skill Checklist
          </motion.div>

          <motion.h1 variants={rise} className="mx-auto mt-8 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tight text-jade-ink sm:text-6xl dark:text-pearl">
            Every skill verified.{" "}
            <span className="animate-gradient-text bg-gradient-to-r from-[#2f8d99] via-verify-ink to-verify-green bg-clip-text text-transparent">
              Every hire defensible.
            </span>
          </motion.h1>

          <motion.p variants={rise} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-jade-muted sm:text-lg dark:text-fog">
            {agencyName} replaces the paper packet with one secure digital vault — two-party verified references, per-specialty competency
            checklists valid a full year, and share links that prove it on demand.
          </motion.p>

          <motion.div variants={rise} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <motion.button
              type="button"
              onClick={() => onRole("checklist")}
              whileHover={{ scale: 1.02, transition: SPRING }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-verify-green px-6 py-3 text-sm font-semibold text-vault-teal-deep shadow-[0_6px_24px_-8px_rgba(124,193,24,0.8)] outline-none transition-colors hover:bg-verify-mint focus-visible:ring-2 focus-visible:ring-verify-green/60"
            >
              <UserRound className="h-4 w-4" /> I&apos;m a nurse — start my checklist <ArrowRight className="h-4 w-4" />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => onRole("recruiter")}
              whileHover={{ scale: 1.02, transition: SPRING }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-vault-border bg-white/80 px-6 py-3 text-sm font-semibold text-jade-ink shadow-sm outline-none backdrop-blur-md transition-colors hover:border-verify-green/60 hover:bg-verify-green/[0.06] hover:text-verify-ink focus-visible:ring-2 focus-visible:ring-verify-green/60 dark:border-jade-mist/60 dark:bg-vault-dark/60 dark:text-pearl dark:shadow-none dark:hover:text-verify-mint"
            >
              <LayoutDashboard className="h-4 w-4" /> Open recruiter console
            </motion.button>
          </motion.div>

          <motion.p variants={rise} className="mt-4 text-xs text-jade-muted dark:text-fog">
            Building verified references instead?{" "}
            <button type="button" onClick={() => onRole("candidate")} className="font-semibold text-verify-ink underline-offset-2 hover:text-verify-green hover:underline dark:text-verify-mint">
              Start the reference flow →
            </button>
          </motion.p>

          <motion.dl variants={rise} className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {STATS.map(([v, l]) => (
              <div key={l}>
                <dd className="bg-gradient-to-r from-[#2f8d99] via-verify-ink to-verify-green bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                  {v}
                </dd>
                <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-jade-muted dark:text-fog">{l}</dt>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </section>

      {/* ═══ BENTO FEATURE GRID ═══ */}
      <section id="features" className="relative py-24 sm:py-28">
        <div aria-hidden className="absolute left-1/2 top-0 h-[320px] w-[640px] -translate-x-1/2 rounded-full bg-verify-green/[0.08] blur-[130px]" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div variants={heroParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mx-auto max-w-3xl text-center">
            <motion.p variants={rise} className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-verify-ink dark:text-verify-green">
              Why VaultVerify
            </motion.p>
            <motion.h2 variants={rise} className="mt-4 text-3xl font-semibold tracking-tight text-jade-ink sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12] dark:text-pearl">
              Enterprise controls.{" "}
              <span className="animate-gradient-text bg-gradient-to-r from-[#2f8d99] via-verify-green to-verify-ink bg-clip-text text-transparent">
                Clinician-simple flow.
              </span>
            </motion.h2>
            <motion.p variants={rise} className="mt-4 text-base leading-relaxed text-jade-muted dark:text-fog">
              Three pillars ship with every checklist — automated mapping, live auditing, and vault-grade security.
            </motion.p>
          </motion.div>

          <motion.div
            variants={bentoParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-90px" }}
            className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <BentoCard
              icon={Waypoints}
              title="Automated Competency Mapping"
              copy="Select a Profession, then a Discipline, then a Specialty — the clinician maps to the exact skills checklist template automatically. No spreadsheets, no wrong form, no re-work."
            >
              <MappingVisual />
            </BentoCard>

            <BentoCard
              icon={Radar}
              title="Real-Time Clinician Audits"
              copy="Every open, rating, N/A and e-signature streams into the recruiter pipeline as it happens — identity checks and fraud flags surface automatically, nothing waits for a download."
            >
              <AuditVisual />
            </BentoCard>

            <BentoCard
              icon={ShieldCheck}
              title="Encrypted Vault Security"
              copy="Single-use tokens, expiring share links and an immutable audit trail — every completion is sealed in the vault and exportable as a branded PDF."
            >
              <VaultVisual />
            </BentoCard>
          </motion.div>
        </div>
      </section>
    </>
  );
}

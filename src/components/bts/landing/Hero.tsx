"use client";

import { useRef, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ShieldCheck, UserRound, LayoutDashboard, Lock, Star, Signature, ChevronRight } from "lucide-react";
import { MagneticButton, GlowButton, fadeUp, staggerParent, EASE_OUT } from "./Primitives";

const MOCK_STEPS = [
  { q: "How did the nurse handle communication with families?", done: true },
  { q: "Reliability and attendance on your unit?", done: true },
  { q: "Would you recommend this nurse for ICU step-down?", done: false, active: true },
];

export function Hero({ agencyName, onRole }: { agencyName: string; onRole: (r: "candidate" | "recruiter" | "checklist") => void }) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  // Scroll parallax — orbs drift at different speeds
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const orbY1 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -90]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, reduce ? 1 : 0.25]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 60]);

  // 3D tilt on the mock card
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springX = useSpring(tiltX, { stiffness: 140, damping: 18 });
  const springY = useSpring(tiltY, { stiffness: 140, damping: 18 });

  const onTilt = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tiltY.set(px * 10);
    tiltX.set(-py * 8);
  };
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden pt-28 pb-20 sm:pt-36">
      {/* backdrop: Midnight Steel depth — grid + brand orbs + top glow line */}
      <div aria-hidden className="bg-grid-light mask-radial-hero absolute inset-0" />
      <motion.div
        aria-hidden
        style={{ y: orbY1 }}
        className="absolute -top-32 left-[8%] h-[440px] w-[440px] rounded-full bg-[#2f8d99]/15 blur-[130px]"
      />
      <motion.div
        aria-hidden
        style={{ y: orbY2 }}
        className="absolute top-24 right-[4%] h-[380px] w-[380px] rounded-full bg-verify-green/[0.13] blur-[120px]"
      />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-verify-green/45 to-transparent" />

      <motion.div
        style={{ opacity: contentOpacity, y: contentY }}
        className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10"
      >
        {/* ── Left: message ── */}
        <motion.div variants={staggerParent(0.11)} initial="hidden" animate="show">
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-verify-green/40 bg-verify-green/10 px-3.5 py-1.5 text-xs font-medium text-verify-ink"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-verify-green" />
            </span>
            Verified nursing references — not just scanned paper
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-jade-ink sm:text-5xl lg:text-[3.4rem]"
          >
            Reference checks that finish in{" "}
            <span className="animate-gradient-text bg-gradient-to-r from-[#0d6b77] via-verify-deep to-verify-green bg-clip-text text-transparent">
              48 hours
            </span>
            , not weeks.
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-6 max-w-xl text-base leading-relaxed text-jade-muted sm:text-lg">
            {agencyName} replaces the paper reference form with a secure two-party flow: the nurse builds a portable profile once, managers
            answer ten anchored questions on any phone in 3–5 minutes, and every skill comes back stamped{" "}
            <span className="font-semibold text-verify-ink">Manager-verified</span> or{" "}
            <span className="font-semibold text-jade-ink">Self-reported</span>.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <MagneticButton onClick={() => onRole("checklist")}>
              <UserRound className="h-4 w-4" /> I&apos;m a nurse — my skills checklist <ChevronRight className="h-4 w-4" />
            </MagneticButton>
            <GlowButton variant="ghost" onClick={() => onRole("recruiter")}>
              <LayoutDashboard className="h-4 w-4" /> I&apos;m a recruiter — view pipeline
            </GlowButton>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-4 text-xs text-[#7d938e]">
            Here for the reference flow?{" "}
            <button type="button" onClick={() => onRole("candidate")} className="font-semibold text-verify-ink underline-offset-2 hover:underline">
              Build my verified references →
            </button>
          </motion.p>

          <motion.dl variants={fadeUp} className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {[
              ["86%", "Completion rate"],
              ["<48h", "Median turnaround"],
              ["3–5 min", "Per reference"],
            ].map(([v, l]) => (
              <div key={l}>
                <dd className="bg-gradient-to-r from-[#03363d] to-verify-deep bg-clip-text text-2xl font-bold text-transparent">{v}</dd>
                <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7d938e]">{l}</dt>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        {/* ── Right: floating live-form mock ── */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.35 }}
          className="relative mx-auto w-full max-w-md [perspective:1200px]"
          onMouseMove={onTilt}
          onMouseLeave={resetTilt}
        >
          <div aria-hidden className="animate-breathe absolute -inset-6 rounded-[28px] bg-verify-green/10 blur-2xl" />
          <motion.div
            style={reduce ? undefined : { rotateX: springX, rotateY: springY, transformStyle: "preserve-3d" }}
            className={reduce ? "animate-float relative" : "relative"}
          >
            <div className="relative rounded-3xl border border-vault-border bg-white p-5 shadow-[0_30px_80px_-20px_rgba(3,54,61,0.25)] vv-card-shadow">
              {/* header */}
              <div className="flex items-center justify-between border-b border-vault-border/60 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vault-teal-deep ring-1 ring-verify-green/40">
                    <span className="bg-gradient-to-br from-verify-mint to-verify-green bg-clip-text text-[11px] font-bold text-transparent">VV</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-jade-ink">Reference request</p>
                    <p className="font-mono text-[10px] text-[#7d938e]">for Maya Chen, RN · ICU</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-verify-green/30 bg-verify-green/10 px-2 py-0.5 font-mono text-[10px] text-verify-ink">
                  <Lock className="h-2.5 w-2.5" /> secure link
                </span>
              </div>

              {/* progress */}
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#eef4f1]">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: reduce ? "40%" : ["0%", "40%"] }}
                    transition={{ duration: 1.4, ease: EASE_OUT, delay: 1 }}
                    className="h-full rounded-full bg-gradient-to-r from-verify-green to-verify-mint"
                  />
                </div>
                <span className="font-mono text-[10px] text-[#7d938e]">Q3 of 10</span>
              </div>

              {/* questions */}
              <div className="mt-5 space-y-4">
                {MOCK_STEPS.map((s, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.9 + i * 0.35, duration: 0.6, ease: EASE_OUT }}
                    className={
                      s.active
                        ? "rounded-xl border border-verify-green/30 bg-verify-green/[0.07] p-3.5"
                        : "rounded-xl border border-vault-border/70 bg-[#f7faf8] p-3.5 opacity-70"
                    }
                  >
                    <p className="text-xs leading-snug text-[#33565b]">{s.q}</p>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((p) => (
                        <span
                          key={p}
                          className={
                            s.active && p === 4
                              ? "h-2.5 w-2.5 rounded-full bg-verify-green shadow-[0_0_10px_rgba(124,193,24,0.9)]"
                              : p <= 4 && s.done
                                ? "h-2 w-2 rounded-full bg-verify-green/70"
                                : "h-2 w-2 rounded-full bg-[#d7e3df]"
                          }
                        />
                      ))}
                      {s.active && (
                        <span className="animate-pulse-dot ml-2 font-mono text-[9px] uppercase tracking-widest text-verify-ink">awaiting</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* signature strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.2, duration: 0.7 }}
                className="mt-5 flex items-center justify-between rounded-xl border border-vault-border/70 bg-[#f7faf8] px-3.5 py-3"
              >
                <div className="flex items-center gap-2 text-jade-muted">
                  <Signature className="h-3.5 w-3.5" />
                  <span className="font-mono text-[10px]">J. Rivera · signed 14:09</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-verify-ink">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              </motion.div>
            </div>

            {/* floating rating chip */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.9, type: "spring", stiffness: 260, damping: 16 }}
              className="absolute -right-2 -top-5 flex items-center gap-1.5 rounded-full border border-vault-border bg-white px-3 py-1.5 text-xs font-semibold text-verify-ink vv-card-shadow sm:-right-4"
            >
              <Star className="h-3.5 w-3.5 fill-verify-green text-verify-green" /> 4.6 overall
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, useInView, useReducedMotion, useMotionValue, useSpring, animate, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── Shared spring + easing language ───────────────────────── */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 36 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.9, ease: EASE_OUT } },
};

export const staggerParent = (stagger = 0.09, delay = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
});

export const HOVER_SPRING = { type: "spring" as const, stiffness: 300, damping: 20, mass: 0.9 };

/* ── Section heading: mono eyebrow + display title ─────────── */

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "left";
}) {
  return (
    <motion.div
      variants={staggerParent(0.12)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={cn("max-w-3xl", align === "center" ? "mx-auto text-center" : "text-left")}
    >
      <motion.p variants={fadeUp} className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-verify-ink">
        {eyebrow}
      </motion.p>
      <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-semibold tracking-tight text-jade-ink sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
        {title}
      </motion.h2>
      {sub && (
        <motion.p variants={fadeUp} className="mt-4 text-base leading-relaxed text-jade-muted">
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}

/* ── Bento card: glass + glow border + cursor spotlight + spring ── */

export type GlowTone = "green" | "jade" | "mint";

const GLOW_RING: Record<GlowTone, string> = {
  green: "from-verify-green/60 via-verify-green/10 to-verify-mint/40",
  jade: "from-[#2f8d99]/70 via-vault-border/30 to-verify-green/35",
  mint: "from-verify-light/45 via-verify-green/15 to-[#2f8d99]/45",
};

const GLOW_SPOT: Record<GlowTone, string> = {
  green: "rgba(124, 193, 24, 0.10)",
  jade: "rgba(47, 141, 153, 0.13)",
  mint: "rgba(124, 193, 24, 0.07)",
};

export function GlowCard({
  children,
  className,
  glow = "green",
}: {
  children: ReactNode;
  className?: string;
  glow?: GlowTone;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduce) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      whileHover={reduce ? undefined : { scale: 1.022, y: -5 }}
      transition={HOVER_SPRING}
      onMouseMove={onMove}
      className={cn("group relative h-full rounded-2xl", className)}
    >
      {/* animated glow ring (border) — reveals on hover */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br opacity-0 blur-[2px] transition-opacity duration-500 group-hover:opacity-100",
          GLOW_RING[glow]
        )}
      />
      {/* crisp gradient edge on hover */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-60",
          GLOW_RING[glow]
        )}
      />
      {/* cursor spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(300px circle at var(--mx, 50%) var(--my, 0%), ${GLOW_SPOT[glow]}, transparent 65%)`,
        }}
      />
      {/* white card surface with soft brand shadow (light theme) */}
      <div className="relative m-px h-[calc(100%-2px)] rounded-[15px] border border-vault-border bg-white vv-card-shadow p-6 transition-colors duration-500 group-hover:border-verify-green/40">
        {children}
      </div>
    </motion.div>
  );
}

/* ── Buttons with spring taps ──────────────────────────────── */

export function GlowButton({
  children,
  onClick,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={variant === "primary" ? { scale: 1.03 } : { scale: 1.02 }}
      whileTap={{ scale: 0.965 }}
      transition={HOVER_SPRING}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-verify-green/60",
        variant === "primary"
          ? "bg-verify-green text-vault-teal-deep shadow-[0_0_28px_-6px_rgba(124,193,24,0.65)] hover:bg-verify-mint hover:shadow-[0_0_36px_-4px_rgba(124,193,24,0.85)]"
          : "border border-slate-300 bg-white text-jade-ink hover:border-verify-green/50 hover:bg-verify-green/10",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

/* ── Magnetic CTA — button leans toward the cursor on springs ── */

export function MagneticButton({
  children,
  onClick,
  variant = "primary",
  className,
  strength = 0.35,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 180, damping: 14, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 180, damping: 14, mass: 0.6 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength * 0.9);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={reduce ? undefined : { x: sx, y: sy }}
      className="inline-block"
    >
      <GlowButton onClick={onClick} variant={variant} className={className}>
        {children}
      </GlowButton>
    </motion.div>
  );
}

/* ── Animated counter (in-view once) ───────────────────────── */

export function AnimatedCounter({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: reduce ? 0.001 : 1.7,
      ease: EASE_OUT,
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, useInView, useReducedMotion, animate, type Variants } from "framer-motion";
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

export const HOVER_SPRING = { type: "spring" as const, stiffness: 320, damping: 22, mass: 0.9 };

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
      <motion.p variants={fadeUp} className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-emerald-400/90">
        {eyebrow}
      </motion.p>
      <motion.h2 variants={fadeUp} className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
        {title}
      </motion.h2>
      {sub && (
        <motion.p variants={fadeUp} className="mt-4 text-base leading-relaxed text-zinc-400">
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}

/* ── Bento card: glass + glow border + cursor spotlight + spring ── */

export function GlowCard({
  children,
  className,
  glow = "emerald",
}: {
  children: ReactNode;
  className?: string;
  glow?: "emerald" | "amber" | "rose";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const glowRing =
    glow === "amber"
      ? "from-amber-400/50 via-amber-200/10 to-emerald-400/35"
      : glow === "rose"
        ? "from-rose-400/45 via-rose-300/10 to-amber-400/30"
        : "from-emerald-400/55 via-emerald-200/10 to-amber-400/35";

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
          glowRing
        )}
      />
      {/* crisp gradient edge on hover */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-60",
          glowRing
        )}
      />
      {/* cursor spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(300px circle at var(--mx, 50%) var(--my, 0%), rgba(52, 211, 153, 0.10), transparent 65%)",
        }}
      />
      <div className="relative m-px h-[calc(100%-2px)] rounded-[15px] border border-white/[0.07] bg-[#0A0D0B]/95 p-6 backdrop-blur-xl transition-colors duration-500 group-hover:border-white/[0.12]">
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
        "relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        variant === "primary"
          ? "bg-emerald-400 text-emerald-950 shadow-[0_0_28px_-6px_rgba(52,211,153,0.65)] hover:bg-emerald-300 hover:shadow-[0_0_36px_-4px_rgba(52,211,153,0.8)]"
          : "border border-white/12 bg-white/[0.04] text-zinc-200 backdrop-blur hover:border-white/25 hover:bg-white/[0.08]",
        className
      )}
    >
      {children}
    </motion.button>
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

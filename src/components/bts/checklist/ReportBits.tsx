"use client";

// ── ReportBits — the shared visual language of the VaultVerify skills report ──
// Mirrors the branded PDF: color-coded rating rings (1 red · 2 amber · 3 blue · 4 green),
// recency pills (navy → steel → pale → dashed N/A), summary donuts, category bars,
// signature capture + attestation block. Used by the fill form, share view and portal.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  RATING_META, RATING_4, RECENCY_META, LAST_PERFORMED, recencyLabel,
  ATTESTATION_STATEMENTS, type AnswerSummary, type SkillAnswer,
} from "@/lib/bts/checklistShared";
import { Eraser } from "lucide-react";

// ── avg → band color (same ramp as the report) ──
export function avgColor(avg: number | null | undefined): string {
  if (avg == null) return "#9db4ad";
  if (avg < 2) return "#e05252";
  if (avg < 2.75) return "#e8a33d";
  if (avg < 3.5) return "#4285d6";
  return "#33a569";
}

// ── Section heading (uppercase tracking like the PDF) ──
export function SectionHeading({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">{children}</h3>
      {right}
    </div>
  );
}

// ── Rating ring — interactive tap target + read-only display ──
// state: "off" (unselected) | "on" (selected) | "lock" (read-only report)
export function RatingRing({ value, state = "lock", onClick, size = 34 }: {
  value: number; state?: "off" | "on" | "lock"; onClick?: () => void; size?: number;
}) {
  const meta = RATING_META[value];
  const dim = useReducedMotion();
  const filled = state !== "off";
  const style = { width: size, height: size, fontSize: size * 0.42 };
  const cls = cn(
    "flex select-none items-center justify-center rounded-full border-2 font-bold transition-colors",
    filled ? "text-white" : "bg-white text-jade-muted",
    state === "off" && "border-vault-border hover:border-verify-green/50",
    state === "on" && "shadow-sm",
    state === "lock" && !filled && "border-dashed border-vault-border text-jade-muted",
  );
  const inner = <span style={{ color: filled ? "#fff" : meta?.text }}>{value}</span>;
  if (state === "lock") {
    return <span className={cn(cls, filled ? "border-transparent" : "bg-white")} style={{ ...style, background: filled ? meta?.dot : undefined }}>{inner}</span>;
  }
  return (
    <motion.button
      type="button" aria-pressed={state === "on"} onClick={onClick} disabled={state === "on" && false}
      whileHover={dim ? undefined : { scale: 1.03 }} whileTap={dim ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className={cn(cls, "cursor-pointer")}
      style={{ ...style, background: filled ? meta?.dot : undefined, borderColor: filled ? meta?.dot : undefined }}
    >
      {inner}
    </motion.button>
  );
}

// ── Recency pill — "Last performed" selector + read-only ──
export function RecencyPill({ k, state = "lock", onClick }: { k: string; state?: "off" | "on" | "lock"; onClick?: () => void }) {
  const meta = RECENCY_META[k];
  const dim = useReducedMotion();
  const label = recencyLabel(k);
  const on = state === "on";
  const lock = state === "lock";
  const cls = cn(
    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
    lock
      ? (meta?.pill ?? "bg-white text-jade-muted border border-vault-border")
      : on
        ? (meta?.pill ?? "")
        : "bg-white text-jade-muted border border-vault-border hover:border-verify-green/50 hover:text-jade-ink",
    !lock && "cursor-pointer",
  );
  if (lock) return <span className={cls}>{label}</span>;
  return (
    <motion.button type="button" aria-pressed={on} onClick={onClick}
      whileHover={dim ? undefined : { scale: 1.03 }} whileTap={dim ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className={cls} style={on && k === "na" ? { background: "#eef4f1" } : undefined}>
      {label}
    </motion.button>
  );
}

// ── Read-only rating cell for report rows ──
export function RatingCell({ a }: { a: SkillAnswer }) {
  if (a.questionType === "rating_1_4") {
    if (a.na) {
      return (
        <span className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-dashed border-vault-border text-[10px] font-bold text-jade-muted">N/A</span>
          <span className="text-[11px] text-jade-muted">Not applicable</span>
        </span>
      );
    }
    const v = Number(a.value);
    return (
      <span className="flex items-center gap-2.5">
        <RatingRing value={v} size={30} />
        <span className={cn("text-[11px] font-semibold", RATING_META[v]?.text)}>{RATING_META[v]?.short ?? `Rated ${v}`}</span>
      </span>
    );
  }
  if (a.questionType === "yes_no") {
    const v = String(a.value ?? "").toLowerCase();
    return (
      <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
        v === "yes" ? "bg-[#e2f4e8] text-[#1f7a4a]" : "bg-[#fdecec] text-[#d64545]")}>
        {v || "—"}
      </span>
    );
  }
  return <span className="text-sm text-jade-ink">{String(a.value ?? "—")}</span>;
}

// ── Report skill row (read-only) — ring + short label + recency pill ──
export function SkillReportRow({ a, first }: { a: SkillAnswer; first?: boolean }) {
  const lp = a.questionType === "rating_1_4" ? a.lastPerformed ?? (a.na ? "na" : null) : null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5", !first && "border-t border-vault-border/50")}>
      <p className="min-w-0 flex-1 text-sm text-jade-ink">
        {a.highRisk && <span className="mr-2 rounded bg-amber-500/15 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-amber-600">High-risk</span>}
        {a.skill}
      </p>
      <span className="flex flex-wrap items-center gap-3">
        <RatingCell a={a} />
        {lp && <RecencyPill k={lp} />}
      </span>
    </div>
  );
}

// ── Generic donut (SVG arcs with 2px gaps) ──
export function Donut({ segments, size = 116, thickness = 15, children }: {
  segments: { color: string; value: number }[]; size?: number; thickness?: number; children?: React.ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef4f1" strokeWidth={thickness} />
        {total > 0 && segments.map((s, i) => {
          if (s.value <= 0) return null;
          const len = (s.value / total) * c;
          const gap = total > 1 ? 2.5 : 0;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(len - gap, 0.5)} ${c - Math.max(len - gap, 0.5)}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">{children}</div>
    </div>
  );
}

// ── "Summary at a glance" — rating mix donut ──
export function MixDonut({ summary, size = 116, thickness = 15 }: { summary: AnswerSummary; size?: number; thickness?: number }) {
  const segs = ([1, 2, 3, 4] as const).map((n) => ({ color: RATING_META[n].dot, value: summary.mix[n] }));
  const rated = summary.rated;
  return (
    <Donut segments={segs} size={size} thickness={thickness}>
      <span className="text-xl font-bold text-jade-ink">{rated}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-jade-muted">rated</span>
    </Donut>
  );
}

// ── % recent donut (performed within the last 3 months) ──
export function RecentDonut({ summary, size = 116, thickness = 15 }: { summary: AnswerSummary; size?: number; thickness?: number }) {
  const pct = summary.recentPct ?? 0;
  const segs = [{ color: "#123c54", value: pct }, { color: "#eef4f1", value: 100 - pct }];
  return (
    <Donut segments={summary.total ? segs : []} size={size} thickness={thickness}>
      <span className="text-xl font-bold text-[#123c54]">{summary.total ? `${pct}%` : "—"}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-jade-muted">recent</span>
    </Donut>
  );
}

// ── Avg ring — overall average with progress arc ──
export function AvgRing({ avg, size = 96, thickness = 10 }: { avg: number | null; size?: number; thickness?: number }) {
  const color = avgColor(avg);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const frac = avg == null ? 0 : Math.min(1, Math.max(0, avg / 4));
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef4f1" strokeWidth={thickness} />
        {frac > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={`${frac * c} ${c}`} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-xl font-bold" style={{ color }}>{avg?.toFixed(1) ?? "—"}</span>
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-jade-muted">avg / 4</span>
      </div>
    </div>
  );
}

// ── Rating-scale legend (1-4) + recency legend ──
export function RatingLegend({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", compact ? "text-[10px]" : "text-[11px]")}>
      {RATING_4.map((r) => (
        <span key={r.value} className="inline-flex items-center gap-1.5 text-jade-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: RATING_META[r.value].dot }} />
          <b className="text-jade-ink">{r.value}</b> {RATING_META[r.value].short}
        </span>
      ))}
    </div>
  );
}

export function RecencyLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
      {LAST_PERFORMED.map((r) => (
        <span key={r.key} className="inline-flex items-center gap-1.5 text-jade-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: RECENCY_META[r.key]?.dot }} />
          {r.label}
        </span>
      ))}
    </div>
  );
}

// ── Category overview bars (avg per category + proficient / recent counts) ──
export function CategoryBars({ summary, max }: { summary: AnswerSummary; max?: number }) {
  const cats = max ? summary.categories.slice(0, max) : summary.categories;
  if (!cats.length) return <p className="text-[11px] text-jade-muted">Answers will chart here as you go.</p>;
  return (
    <div className="space-y-2.5">
      {cats.map((cat) => {
        const color = avgColor(cat.avg);
        return (
          <div key={cat.name}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-jade-ink">{cat.name}</span>
              <span className="shrink-0 font-mono font-bold" style={{ color }}>{cat.avg?.toFixed(1) ?? "—"}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef4f1]">
              <motion.div className="h-full rounded-full" style={{ background: color }}
                initial={{ width: 0 }} animate={{ width: `${((cat.avg ?? 0) / 4) * 100}%` }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }} />
            </div>
            <p className="mt-0.5 text-[10px] text-jade-muted">{cat.total} skill{cat.total === 1 ? "" : "s"} · {cat.proficient} proficient · {cat.recent} recent</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Signature capture — pointer-drawn on canvas, emitted as a PNG data URL ──
export interface StrokePoint { x: number; y: number }

export function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<StrokePoint[][]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(!!value);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#dce7e2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, h * 0.74);
    ctx.lineTo(w - 14, h * 0.74);
    ctx.stroke();
    ctx.strokeStyle = "#03363d";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
    const ro = new ResizeObserver(() => redraw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [redraw]);

  const posOf = (e: React.PointerEvent): StrokePoint => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    if (!drawing.current && e.pointerType === "mouse" && e.button !== 0) return;
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    strokes.current.push([posOf(e)]);
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    strokes.current[strokes.current.length - 1]?.push(posOf(e));
    redraw();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    const inked = strokes.current.some((s) => s.length >= 2);
    setHasInk(inked);
    onChange(inked && canvas ? canvas.toDataURL("image/png") : null);
  };

  const clear = () => {
    strokes.current = [];
    setHasInk(false);
    onChange(null);
    redraw();
  };

  return (
    <div ref={wrapRef} className="relative">
      <canvas ref={canvasRef}
        className="h-36 w-full cursor-crosshair touch-none rounded-xl border border-vault-border bg-white"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} />
      <button type="button" onClick={clear} disabled={!hasInk}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-vault-border bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-jade-muted transition hover:text-jade-ink disabled:opacity-40">
        <Eraser className="h-3 w-3" /> Clear
      </button>
    </div>
  );
}

// ── Uploaded signature images get scaled down so they fit the storage limit ──
export function fileToScaledDataUrl(file: File, maxW = 620): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, 1));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas unavailable")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

// ── Signature display — draw → image, type → script text, upload → image ──
export function SignatureView({ att }: { att: { mode: string; signature: string; printedName?: string; signedAt?: string } }) {
  if (att.mode === "type") {
    return (
      <p className="min-h-[44px] font-serif text-2xl italic leading-[44px] text-[#03363d]" style={{ fontFamily: "'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive" }}>
        {att.signature}
      </p>
    );
  }
  return <img src={att.signature} alt="Signature" className="max-h-[72px] rounded-lg border border-vault-border/60 bg-white" />;
}

// ── Attestation block (read-only, matches the PDF section) ──
export interface AttestationData { agreed: boolean; mode: string; signature: string; printedName: string; signedAt: string }

export function AttestationView({ att, fallbackName }: { att: AttestationData | null; fallbackName: string }) {
  if (!att) return null;
  const fmt = (d: string) => { try { return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return d; } };
  return (
    <div className="rounded-xl border border-vault-border bg-[#fbfdfc] p-4 sm:p-5">
      <SectionHeading>Candidate attestation</SectionHeading>
      <ul className="mt-3 space-y-2">
        {ATTESTATION_STATEMENTS.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-jade-muted">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-verify-green text-[9px] font-bold text-white">✓</span>
            {s}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jade-muted">Signature</p>
          <div className="mt-1.5"><SignatureView att={att} /></div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-jade-muted">Printed name</p>
            <p className="mt-1 border-b border-vault-border pb-1 text-sm font-medium text-jade-ink">{att.printedName || fallbackName}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-jade-muted">Date</p>
            <p className="mt-1 border-b border-vault-border pb-1 text-sm font-medium text-jade-ink">{att.signedAt ? fmt(att.signedAt) : "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Additional questions (read-only) ──
export interface AdditionalAnswer { id: string; prompt: string; kind: string; value: string | null }

export function AdditionalQuestionsView({ items }: { items: AdditionalAnswer[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
      {items.map((q, i) => (
        <div key={q.id || i} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5", i > 0 && "border-t border-vault-border/50")}>
          <p className="min-w-0 flex-1 text-sm text-jade-ink">{q.prompt}</p>
          {q.kind === "YES_NO" ? (
            <RatingCell a={{ category: "", skill: q.prompt, questionType: "yes_no", value: q.value, na: false }} />
          ) : (
            <p className="max-w-full text-sm text-jade-muted sm:max-w-[60%]">{q.value || "—"}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Recency mini-strip for summary panels ──
export function RecencyStrip({ summary }: { summary: AnswerSummary }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 text-center">
      {LAST_PERFORMED.map((r) => (
        <div key={r.key} className="rounded-lg bg-[#f6faf8] px-1 py-1.5">
          <p className="text-sm font-bold" style={{ color: RECENCY_META[r.key]?.dot === "#dbe4e0" ? "#8aa29c" : RECENCY_META[r.key]?.dot }}>
            {summary.recency[r.key as "3" | "6" | "6+" | "na"]}
          </p>
          <p className="mt-0.5 text-[9px] leading-tight text-jade-muted">{r.label}</p>
        </div>
      ))}
    </div>
  );
}

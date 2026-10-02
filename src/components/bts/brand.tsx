"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { STATUS_META, PROFICIENCY_META } from "@/lib/bts/constants";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

// ── VaultVerify logo mark — abstract V-in-circle from the brand palette ──
export function VaultMark({ size = 36, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" role="img">
      <defs>
        <linearGradient id={`ring-${uid}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7cc118" />
          <stop offset="0.55" stopColor="#1b4e54" />
          <stop offset="1" stopColor="#03363d" />
        </linearGradient>
        <linearGradient id={`vee-${uid}`} x1="20" y1="20" x2="44" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a4d84a" />
          <stop offset="1" stopColor="#7cc118" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#081215" />
      <circle cx="32" cy="32" r="23.5" fill="#03363d" stroke={`url(#ring-${uid})`} strokeWidth="2.5" />
      <path
        d="M20.5 22.5 L32 45.5 L43.5 22.5"
        fill="none"
        stroke={`url(#vee-${uid})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Agency banner (multi-tenant branding) ──
export function AgencyLogo({ logoText, name, size = "md", light = false }: { logoText: string; name: string; size?: "sm" | "md" | "lg"; light?: boolean }) {
  const px = size === "lg" ? 48 : size === "sm" ? 28 : 36;
  if (logoText === "VV") {
    return (
      <div className="flex items-center gap-2.5">
        <VaultMark size={px} />
        <div className="leading-tight">
          <div className={cn("font-semibold", size === "lg" ? "text-lg" : "text-sm", light ? "text-white" : "text-slate-900")}>
            Vault<span className="text-verify-deep">Verify</span>
          </div>
        </div>
      </div>
    );
  }
  const box = size === "lg" ? "h-12 w-12 text-lg" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("flex items-center justify-center rounded-lg bg-teal-700 font-bold tracking-tight text-white", box)}>
        {logoText.slice(0, 4)}
      </div>
      <div className="leading-tight">
        <div className={cn("font-semibold", size === "lg" ? "text-lg" : "text-sm", light ? "text-white" : "text-slate-900")}>{name}</div>
      </div>
    </div>
  );
}

// ── Status pipeline badge ──
export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", meta.color)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {meta.label}
    </span>
  );
}

// ── Skills badge: self-reported vs manager-verified ──
export function SkillBadge({ name, verified, proficiency }: { name: string; verified: boolean; proficiency: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
        verified ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-600"
      )}
      title={verified ? "Manager-verified by reference" : "Self-reported by nurse"}
    >
      {verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3 opacity-60" />}
      <span className="font-medium">{name}</span>
      <span className="opacity-60">· {PROFICIENCY_META[proficiency]?.short ?? proficiency}</span>
      <span className={cn("rounded px-1 text-[10px] font-semibold uppercase tracking-wide", verified ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-600")}>
        {verified ? "Verified" : "Self"}
      </span>
    </span>
  );
}

// ── Fraud severity chip ──
export function FlagChip({ type, severity }: { type: string; severity: string }) {
  const high = severity === "HIGH";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium", high ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
      <ShieldX className="h-3 w-3" />
      {type.replaceAll("_", " ")}
    </span>
  );
}

// ── Rating pips (1-5 display) ──
export function RatingPips({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-2 w-2 rounded-full", i <= Math.round(value) ? "bg-teal-600" : "bg-slate-200")} />
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-700">{value.toFixed(1)}</span>
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      {label ?? "Loading…"}
    </div>
  );
}

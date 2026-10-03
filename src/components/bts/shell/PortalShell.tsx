"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { VaultMark } from "../brand";
import { LogOut, Menu, X } from "lucide-react";

// ── Shared sidebar shell for role-based portals (candidate, recruiter) ──
// Desktop: fixed left rail. Mobile: sticky top bar with a slide-over drawer.

export interface ShellNavItem {
  key: string;
  label: string;
  icon: typeof LogOut;
  badge?: string | number;
}

export function PortalShell({ badge, userName, userEmail, nav, active, onNavigate, onSignOut, headerActions, wide, brandOverride, children }: {
  badge: string;
  userName: string;
  userEmail: string;
  nav: ShellNavItem[];
  active: string;
  onNavigate: (key: string) => void;
  onSignOut: () => void;
  headerActions?: ReactNode;
  wide?: boolean;
  brandOverride?: ReactNode;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0.2 } : { type: "spring" as const, stiffness: 400, damping: 32 };
  const current = nav.find((n) => n.key === active);

  const navList = (onPick: (key: string) => void) => (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3">
      {nav.map((n) => {
        const on = n.key === active;
        return (
          <button key={n.key} type="button" onClick={() => onPick(n.key)} aria-current={on ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              on ? "bg-verify-green/15 text-verify-ink" : "text-jade-muted hover:bg-jade-ink/5 hover:text-jade-ink",
            )}>
            <n.icon className={cn("h-4 w-4 shrink-0", on ? "text-verify-ink" : "text-jade-muted group-hover:text-jade-ink")} />
            <span className="flex-1 text-left">{n.label}</span>
            {n.badge != null && n.badge !== 0 && n.badge !== "" && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", on ? "bg-verify-green text-vault-dark" : "bg-jade-ink/10 text-jade-muted")}>{n.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const brandBlock = brandOverride ?? (
    <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
      <VaultMark size={30} />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-jade-ink">Vault<span className="text-verify-ink">Verify</span></p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-verify-ink">{badge}</p>
      </div>
    </div>
  );

  const userBlock = (
    <div className="border-t border-vault-border/70 p-3">
      <div className="flex items-center gap-3 rounded-xl bg-white p-3 vv-card-shadow">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-verify-green/20 text-xs font-bold text-verify-ink">
          {userName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-semibold text-jade-ink">{userName}</p>
          <p className="truncate text-[11px] text-jade-muted">{userEmail}</p>
        </div>
        <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"
          className="rounded-lg p-1.5 text-jade-muted transition hover:bg-jade-ink/5 hover:text-jade-ink">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="vv-page min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-vault-border/70 bg-white/70 backdrop-blur-xl lg:flex">
        {brandBlock}
        {navList(onNavigate)}
        {userBlock}
      </aside>

      {/* mobile top bar */}
      <div className="lg:hidden">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-vault-border/70 bg-white/85 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <VaultMark size={26} />
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-jade-ink">Vault<span className="text-verify-ink">Verify</span></p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-verify-ink">{badge}</p>
            </div>
          </div>
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu"
            className="rounded-lg border border-vault-border p-2 text-jade-ink"><Menu className="h-4 w-4" /></button>
        </header>
        <AnimatePresence>
          {drawer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-[#0b2b30]/45 backdrop-blur-sm" onClick={() => setDrawer(false)}>
              <motion.div initial={{ x: reduce ? 0 : -280 }} animate={{ x: 0 }} exit={{ x: reduce ? 0 : -280 }} transition={spring}
                className="flex h-full w-72 flex-col border-r border-vault-border bg-white" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between pr-3">
                  {brandBlock}
                  <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu"
                    className="rounded-lg p-1.5 text-jade-muted hover:bg-jade-ink/5 hover:text-jade-ink"><X className="h-4 w-4" /></button>
                </div>
                {navList((k) => { setDrawer(false); onNavigate(k); })}
                {userBlock}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* content column */}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-vault-border/70 bg-white/75 px-6 backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-2 text-jade-ink">
            {current && <><current.icon className="h-4 w-4 text-verify-ink" /><h1 className="text-sm font-semibold">{current.label}</h1></>}
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </header>
        <main className={cn("px-4 pb-14 pt-6 sm:px-6", wide ? "mx-auto max-w-6xl" : "mx-auto max-w-5xl")}>{children}</main>
      </div>
    </div>
  );
}

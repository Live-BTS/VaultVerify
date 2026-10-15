"use client";

import { useEffect, useState } from "react";

// ── SecurityGuard ────────────────────────────────────────────────
// Production-only deterrent layer that keeps application internals out of
// casual view:
//   · right-click context menu disabled
//   · devtools / view-source shortcuts blocked (F12, Ctrl+U, Ctrl+Shift+I/J/C)
//   · devtools-open detection (window geometry heuristic) → full-screen
//     shield that visually hides the app until devtools close
//
// Honest scope: nothing client-side is absolute — the browser must receive
// code to run it. This layer removes the EASY paths (view-source, F12,
// right-click inspect) while the real guarantees live server-side: keys and
// DB access never leave the server, APIs return only business data, source
// maps are not shipped, console is stripped, and CSP blocks external script
// injection. See DEPLOY.md § Security.
//
// Dev/sandbox: component renders null so testing is never obstructed.
// Static NODE_ENV replacement in the production build keeps this check free.

export function SecurityGuard() {
  const [shielded, setShielded] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    // Devtools geometry check only on fine-pointer (desktop) devices —
    // mobile browsers resize innerHeight constantly (URL bar) and would
    // false-positive.
    const desktop = window.matchMedia?.("(pointer: fine)")?.matches ?? true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const geometryDelta = () =>
      Math.max(
        window.outerWidth - window.innerWidth,
        window.outerHeight - window.innerHeight,
      );

    const sweep = () => {
      setShielded(desktop && geometryDelta() > 160);
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (mod && k === "u")) {
        e.preventDefault();
        e.stopPropagation();
        setShielded(true);
      }
    };

    const onContext = (e: MouseEvent) => e.preventDefault();

    const startTimer = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        sweep();
      }, 1200);
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("resize", startTimer);
    window.addEventListener("focus", sweep);
    window.addEventListener("load", sweep);
    // Poll lightly — devtools can open without a resize event in some setups.
    const poll = setInterval(sweep, 2500);

    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("resize", startTimer);
      window.removeEventListener("focus", sweep);
      window.removeEventListener("load", sweep);
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (process.env.NODE_ENV !== "production") return null;

  if (!shielded) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#f4f9f5]"
      style={{ backdropFilter: "blur(24px)" }}
      role="alert"
    >
      <div className="mx-4 max-w-sm rounded-2xl border border-[#d8e6da] bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f2e9]">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#0a7c3e]" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="mt-4 text-base font-semibold text-[#122a20]">Protected session</p>
        <p className="mt-2 text-sm leading-relaxed text-[#4c6457]">
          VaultVerify safeguards healthcare data. Developer tools are not available while using this application —
          close them to continue.
        </p>
        <p className="mt-4 text-[11px] text-[#8aa29c]">All activity on this platform is audit-logged.</p>
      </div>
    </div>
  );
}

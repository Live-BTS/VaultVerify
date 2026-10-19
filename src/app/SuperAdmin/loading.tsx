// ── Route-level loading shell for /SuperAdmin ──────────────────────
// Renders INSTANTLY (static markup, zero JS of its own) while the console's
// client bundle streams in. Previously the route painted a blank white gap
// until the (formerly ~1MB, SheetJS-laden) bundle was downloaded and hydrated,
// which read as a broken/slow page — the owner's "loading takes a lot of
// time" report. Combined with the lazy `xlsx` import in SuperAdmin.tsx, the
// shell now appears immediately and the interactive gate swaps in fast.

export default function SuperAdminLoading() {
  return (
    <div className="vv-page flex min-h-screen items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-vault-border bg-white vv-card-shadow p-8"
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        <div className="flex flex-col items-center text-center">
          <div className="h-11 w-11 animate-pulse rounded-xl bg-verify-green/15" />
          <div className="mt-4 h-5 w-40 animate-pulse rounded bg-jade-ink/10" />
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-jade-ink/5" />
          <div className="mt-8 h-10 w-full animate-pulse rounded-lg bg-jade-ink/5" />
          <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-jade-ink/5" />
          <p className="mt-6 text-xs text-jade-muted">Loading the console…</p>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

// PERF: pure-static 404 — server component, zero client JS, prerendered and
// served from the CDN edge. Nothing here needs hydration, so the nonce-free
// bootstrap (it runs under the static fallback CSP) is harmless by design.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f9f5] px-4 text-center">
      <p className="text-6xl font-bold text-[#0b3d3f]">404</p>
      <h1 className="mt-3 text-lg font-semibold text-jade-ink">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-jade-muted">
        The link may have expired — single-use links stop working once used or
        revoked. If you followed a link from an email, request a fresh one from
        the sender.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-[#0b3d3f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d3f]/90"
      >
        Back to VaultVerify
      </Link>
    </div>
  );
}

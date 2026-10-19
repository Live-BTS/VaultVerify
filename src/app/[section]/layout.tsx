import type { ReactNode } from "react";

// PERF/SEC-22: this app route renders PER REQUEST so the nonce CSP
// (src/proxy.ts + lib/bts/csp.ts) can stamp a fresh nonce into the bootstrap
// scripts ('strict-dynamic' blocks a frozen one). The flag lives here — NOT
// in the root layout — so the pure-static marketing pages (/, /privacy,
// /terms) can prerender and be served from the CDN edge.
export const dynamic = "force-dynamic";

export default function SectionLayout({ children }: { children: ReactNode }) {
  return children;
}

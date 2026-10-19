// SEC-22: Content-Security-Policy builder.
//
// The pre-SEC-22 policy allowed `script-src 'unsafe-inline'`, which reduces
// the CSP's XSS protection substantially: any injected inline <script> runs.
// Document requests now get a PER-REQUEST NONCE via src/middleware.ts, and
// Next.js applies that nonce to its own bootstrap scripts (it reads the
// `Content-Security-Policy` request header set by middleware and propagates
// the nonce to every script it emits). 'strict-dynamic' lets nonce-approved
// bootstrap scripts load the rest of the app bundle.
//
// Deliberate residuals (documented, reviewed):
//   · style-src 'unsafe-inline' stays — Tailwind/shadcn/radix emit inline
//     style attributes throughout; removing it breaks the UI wholesale.
//   · img-src data:/blob: stay (chart + PDF preview assets).
// The static fallback header in next.config.ts still applies to non-document
// paths; browsers intersect multiple CSP headers, so a nonce-approved script
// satisfies both, and a bare inline script satisfies neither.
export function buildDocumentCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

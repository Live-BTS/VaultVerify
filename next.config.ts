import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy: everything is self-hosted; scripts are the Next.js
// bootstrap + React hydration (inline). 'unsafe-eval' only for dev (HMR).
// connect-src 'self' — the browser may ONLY talk to this origin: no external
// API hosts are reachable from client code by policy, not just by convention.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // REQUIRED for pdfkit/fontkit (server-only PDF renderer); without it `next build` fails
  // ("The export applyDecoratedDescriptor was not found in module .../@swc/helpers" from fontkit).
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Keep the PDF renderer's runtime assets (logo + fonts) in the traced output.
  outputFileTracingIncludes: {
    "/api/checklist/pdf": ["./assets/skills-checklist/**/*"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ── Security hardening ──────────────────────────────────────────────
  // Do not advertise the framework.
  poweredByHeader: false,
  // Never ship readable source maps to the browser.
  productionBrowserSourceMaps: false,
  // Strip console.* from the CLIENT bundle in production (server logs kept
  // so diagnostics still work server-side). console.error survives both.
  compiler: {
    removeConsole: isDev ? false : { exclude: ["error"] },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;

// ── System configuration manifest (SERVER-ONLY) ─────────────────
// Single source of truth for where every integration credential lives.
// Exposed to the superadmin console via POST /api/superadmin
// { action: "system_config" } — which returns CONFIGURED FLAGS ONLY,
// never values. Values themselves live exclusively in environment
// variables (local .env / Vercel encrypted env store).

export interface SystemItem {
  key: string;
  label: string;
  envVar: string;
  provider: "Supabase" | "Brevo" | "Vercel";
  purpose: string;
  critical: boolean;
}

export const SYSTEM_ITEMS: SystemItem[] = [
  {
    key: "database",
    label: "Production database",
    envVar: "DATABASE_URL",
    provider: "Supabase",
    purpose: "Postgres connection (pooled) — every model in prisma/schema.prisma",
    critical: true,
  },
  {
    key: "brevo_api",
    label: "Transactional email",
    envVar: "BREVO_API_KEY",
    provider: "Brevo",
    purpose: "Reference invites, reminders, swap notices, completion alerts (REST API transport)",
    critical: true,
  },
  {
    key: "brevo_sender",
    label: "Verified sender",
    envVar: "BREVO_SENDER_EMAIL",
    provider: "Brevo",
    purpose: "From-address for all outbound email — must be verified in the Brevo dashboard",
    critical: true,
  },
  {
    key: "brevo_smtp",
    label: "SMTP relay (fallback)",
    envVar: "BREVO_SMTP_KEY",
    provider: "Brevo",
    purpose: "Optional smtp-relay.brevo.com:587 transport; REST API is primary",
    critical: false,
  },
  {
    key: "superadmin_code",
    label: "Superadmin console gate",
    envVar: "SUPERADMIN_CODE",
    provider: "Vercel",
    purpose: "Access code for this console; fail-closed when unset",
    critical: true,
  },
  {
    key: "recruiter_code",
    label: "Recruiter console gate",
    envVar: "RECRUITER_CODE",
    provider: "Vercel",
    purpose: "Access code for the recruiter pipeline + PDF packet; fail-closed when unset",
    critical: true,
  },
  {
    key: "supabase_url",
    label: "Supabase project (dormant)",
    envVar: "NEXT_PUBLIC_SUPABASE_URL",
    provider: "Supabase",
    purpose: "Reserved for future client-side features — no code consumes it today",
    critical: false,
  },
  {
    key: "supabase_anon",
    label: "Supabase anon key (dormant)",
    envVar: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    provider: "Supabase",
    purpose: "Reserved — no code consumes it today",
    critical: false,
  },
  {
    key: "supabase_service",
    label: "Supabase service key (dormant)",
    envVar: "SUPABASE_SERVICE_ROLE_KEY",
    provider: "Supabase",
    purpose: "Server-only reserved key — never prefixed NEXT_PUBLIC, never shipped to browsers",
    critical: false,
  },
];

export interface SystemProtection {
  label: string;
  detail: string;
}

export const SYSTEM_PROTECTIONS: SystemProtection[] = [
  { label: "Secrets server-side only", detail: "Keys live in env vars; API routes never forward them; no NEXT_PUBLIC secret is consumed by client code." },
  { label: "Browser source maps off", detail: "productionBrowserSourceMaps: false — shipped JS is minified and unreadable." },
  { label: "Console stripped in production", detail: "removeConsole compiler pass drops client-side logs; console.error survives for diagnostics." },
  { label: "Content-Security-Policy", detail: "default-src 'self'; connect-src 'self' — browsers may only load and talk to this origin." },
  { label: "Framework fingerprint hidden", detail: "poweredByHeader: false removes the X-Powered-By response header." },
  { label: "Devtools & view-source deterrent", detail: "SecurityGuard blocks F12 / Ctrl+U / right-click and shields the page while devtools are open (production only)." },
  { label: "Access codes fail-closed", detail: "Superadmin and recruiter gates read env-only codes; unset codes lock the console." },
  { label: "Security headers", detail: "X-Frame-Options DENY, nosniff, strict Referrer-Policy, restrictive Permissions-Policy, COOP same-origin." },
];

// Build the API payload — CONFIGURED FLAGS ONLY, never values.
export function buildSystemStatus() {
  return {
    items: SYSTEM_ITEMS.map((i) => ({
      key: i.key,
      label: i.label,
      envVar: i.envVar,
      provider: i.provider,
      purpose: i.purpose,
      critical: i.critical,
      configured: !!process.env[i.envVar],
    })),
    protections: SYSTEM_PROTECTIONS,
    runtime: {
      databaseProvider: "postgresql (Supabase pooled)",
      emailProvider: process.env.BREVO_API_KEY ? "Brevo live (demo-domain guard active)" : "sandbox (simulated + logged)",
      smsProvider: "sandbox (simulated until an SMS sender is provisioned)",
      environment: process.env.NODE_ENV ?? "unknown",
    },
  };
}

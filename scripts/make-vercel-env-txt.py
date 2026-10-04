#!/usr/bin/env python3
"""Build download/vercel-env-vars.txt from the local .env for Vercel paste-in.

Prints only variable NAMES + value lengths to stdout — never secret values —
so the output is safe to show in chat while the full values land in the file.
"""
from pathlib import Path

ROOT = Path("/home/z/my-project")
ENV = ROOT / ".env"
OUT = ROOT / "download" / "vercel-env-vars.txt"

REQUIRED = [
    "DATABASE_URL",            # Supabase Postgres (session pooler) — everything fails without it
    "BREVO_API_KEY",           # transactional email: verification links, OTP, invites
    "BREVO_SENDER_EMAIL",      # verified Brevo sender
    "BREVO_SENDER_NAME",       # display name
    "SUPERADMIN_EMAIL",        # inbox that receives the superadmin OTP
    "SUPERADMIN_CODE",         # backup static superadmin login
    "RECRUITER_CODE",          # legacy agency access-code path
]
OPTIONAL = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "BREVO_SMTP_KEY",
]

def parse_env(text: str) -> dict[str, str]:
    vals: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        vals[key.strip()] = value
    return vals

def main() -> None:
    raw = ENV.read_text()
    env = parse_env(raw)
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise SystemExit(f"MISSING in local .env: {', '.join(missing)}")

    lines = [
        "# VaultVerify — Vercel Environment Variables",
        "# Paste each entry in Vercel → your project → Settings → Environment Variables.",
        "# Enable all three environments (Production / Preview / Development).",
        "# After saving, redeploy (Deployments → ⋯ → Redeploy) so the values take effect.",
        "",
    ]
    lines += [f"{k}={env[k]}" for k in REQUIRED]
    lines += [
        "",
        "# ── Optional (not used by app code; only shown as flags in the superadmin",
        "#    integrations table). Uncomment to make those rows green. ──",
    ]
    lines += [f"# {k}={env[k]}" for k in OPTIONAL if env.get(k)]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n")

    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    for k in REQUIRED:
        print(f"  required  {k:<32} len={len(env[k])}")
    for k in OPTIONAL:
        if env.get(k):
            print(f"  optional  {k:<32} len={len(env[k])}")

if __name__ == "__main__":
    main()

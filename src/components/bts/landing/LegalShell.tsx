// Shared shell for the legal pages (/terms, /privacy) — same jade/ink brand as the landing.

import Link from "next/link";
import { VaultMark } from "@/components/bts/brand";
import type { LegalDoc } from "@/content/terms";

export function LegalShell({ doc, other }: { doc: LegalDoc; other: { href: string; label: string } }) {
  return (
    <div className="vv-page min-h-screen">
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <VaultMark size={34} />
            <span className="text-sm font-semibold tracking-tight text-jade-ink">
              Vault<span className="text-verify-ink">Verify</span>
            </span>
          </Link>
          <Link
            href="/"
            className="rounded-full border border-verify-green/40 bg-verify-green/10 px-4 py-1.5 text-[13px] font-medium text-verify-ink transition hover:bg-verify-green/20"
          >
            Back to the site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-verify-ink/80">VaultVerify · Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-jade-ink sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 font-mono text-xs text-[#7d938e]">Last updated: {doc.updated}</p>

        <div className="mt-8 space-y-5">
          {doc.intro.map((p, i) => (
            <p key={i} className="rounded-2xl border border-verify-green/25 bg-verify-green/[0.06] p-5 text-sm leading-relaxed text-[#33565b]">
              {p}
            </p>
          ))}
        </div>

        <div className="mt-10 space-y-9">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold text-jade-ink">{s.h}</h2>
              <div className="mt-2.5 space-y-3">
                {s.p.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-jade-muted">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-4 rounded-2xl border border-vault-border bg-white p-5 vv-card-shadow">
          <p className="text-sm text-jade-muted">
            Also read our{" "}
            <Link href={other.href} className="font-semibold text-verify-ink underline-offset-2 hover:underline">
              {other.label}
            </Link>
            .
          </p>
          <Link
            href="/"
            className="ml-auto rounded-full bg-[#0b3d3f] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#0b3d3f]/90"
          >
            Open VaultVerify
          </Link>
        </div>
      </main>

      <footer className="border-t border-vault-border bg-white/70">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-[#7d938e] sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} VaultVerify · References, verified. Skills, proven.</span>
          <span className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-jade-ink">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-jade-ink">Privacy Policy</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

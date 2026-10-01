"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgencyLogo } from "./brand";
import { UserRound, ClipboardCheck, LayoutDashboard, ShieldCheck, Clock, FileCheck2, Smartphone, Fingerprint, BellRing } from "lucide-react";

export interface AgencyInfo {
  id: string;
  name: string;
  logoText: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
}

export type Role = "candidate" | "recruiter";

export function LandingView({
  agency,
  onRole,
  stats,
}: {
  agency: AgencyInfo | null;
  onRole: (r: Role) => void;
  stats: { completionRate: number; avgTimeHours: number } | null;
}) {
  const name = agency?.name ?? "MEDS Talent";
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <AgencyLogo logoText={agency?.logoText ?? "MEDS"} name={name} />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onRole("recruiter")} className="text-slate-600">
              Recruiter sign in
            </Button>
            <Button size="sm" onClick={() => onRole("candidate")} className="bg-teal-700 hover:bg-teal-800">
              Nurse sign up
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified nursing references — not just paper forms
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Reference checks that finish in <span className="text-teal-700">48 hours</span>, not weeks.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {name} replaces the paper reference form with a secure two-party flow: the nurse builds a portable profile, managers answer 10 questions on any phone in 3–5 minutes, and every skill comes back with a{" "}
              <strong className="font-semibold text-slate-800">Manager-verified</strong> or <strong className="font-semibold text-slate-800">Self-reported</strong> badge.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => onRole("candidate")} className="bg-teal-700 hover:bg-teal-800">
                <UserRound className="mr-2 h-4 w-4" /> I&apos;m a nurse — build my profile
              </Button>
              <Button size="lg" variant="outline" onClick={() => onRole("recruiter")} className="border-teal-700 text-teal-800 hover:bg-teal-50">
                <LayoutDashboard className="mr-2 h-4 w-4" /> I&apos;m a recruiter — view pipeline
              </Button>
            </div>
            {stats && (
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Completion rate</dt>
                  <dd className="mt-1 text-2xl font-bold text-slate-900">{stats.completionRate}%</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Median time</dt>
                  <dd className="mt-1 text-2xl font-bold text-slate-900">{stats.avgTimeHours}h</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Skills verified</dt>
                  <dd className="mt-1 text-2xl font-bold text-slate-900">Med-Surg + ICU</dd>
                </div>
              </dl>
            )}
          </div>

          {/* Flow preview card */}
          <Card className="border-slate-200 shadow-lg shadow-slate-200/50">
            <CardContent className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">The two-party flow</p>
              <ol className="mt-4 space-y-4">
                {[
                  { icon: UserRound, t: "Nurse builds a BTS profile", d: "Specialty, role, and a self-rated skills checklist with recency" },
                  { icon: BellRing, t: "Secure invite goes out", d: "Branded SMS + email with a no-login link that expires in 14 days" },
                  { icon: Smartphone, t: "Manager answers on mobile", d: "One question per screen, anchored 5-point scale, optional skills check" },
                  { icon: Fingerprint, t: "Identity + fraud checks", d: "Employer-domain match, callback code, duplicate-IP and speed flags" },
                  { icon: FileCheck2, t: "Branded packet lands", d: "PDF + structured data, live status for recruiters, reminders at day 2/5/9" },
                ].map((s, i) => (
                  <li key={i} className="flex gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        <span className="mr-1.5 text-teal-700">{i + 1}.</span>
                        {s.t}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-slate-600">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>

        {/* Role cards */}
        <section className="grid gap-5 pb-4 md:grid-cols-3">
          <Card className="cursor-pointer border-slate-200 transition hover:border-teal-300 hover:shadow-md" onClick={() => onRole("candidate")}>
            <CardContent className="p-6">
              <ClipboardCheck className="h-6 w-6 text-teal-700" />
              <h3 className="mt-3 font-semibold text-slate-900">Nurses</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Create your profile once, self-rate your skills, and reuse verified references across every agency you work with.
              </p>
              <p className="mt-4 text-sm font-medium text-teal-700">Start your profile →</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer border-slate-200 transition hover:border-teal-300 hover:shadow-md" onClick={() => onRole("recruiter")}>
            <CardContent className="p-6">
              <LayoutDashboard className="h-6 w-6 text-teal-700" />
              <h3 className="mt-3 font-semibold text-slate-900">Recruiters</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Live pipeline status, fraud flags, verified skill badges, and a branded PDF packet for every completed reference.
              </p>
              <p className="mt-4 text-sm font-medium text-teal-700">Open the dashboard →</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="p-6">
              <Clock className="h-6 w-6 text-slate-500" />
              <h3 className="mt-3 font-semibold text-slate-900">References (managers)</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                You&apos;ll get a secure link by SMS or email — no account needed. Identity check, 10 questions, e-sign. Done in minutes on your phone.
              </p>
              <p className="mt-4 text-xs text-slate-500">Demo: open a link from the candidate dashboard.</p>
            </CardContent>
          </Card>
        </section>

        {/* Trust strip */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Built for trust from day one</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            {[
              ["Candidate consent first", "A signed release is captured before any manager is contacted — protecting references and lifting response rates."],
              ["Fraud patterns flagged", "Free-email surname matches, duplicate IPs across references, and sub-60-second completions are surfaced automatically."],
              ["Immutable audit trail", "Every view, edit, identity check, and signature is timestamped and stored against the record."],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-700" />
                  <p className="text-sm font-semibold text-slate-900">{t}</p>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} {name} · BTS Phase 1 pilot — sandbox build</span>
          <span>Multi-tenant ready · Zipvault notification service compatible</span>
        </div>
      </footer>
    </div>
  );
}

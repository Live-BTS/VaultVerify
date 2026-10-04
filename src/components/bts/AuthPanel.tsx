"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, ShieldCheck, LogIn } from "lucide-react";

// ── AuthPanel — recruiter signup / sign-in / email-verification ────
// Flow: create account → we email a confirmation link → verify →
// onboarding → dashboard. (Candidates use the same flow inside their
// portal, wired to /api/checklist/account.)

type Mode = "signin" | "signup" | "check";

export function AuthPanel({
  onAuthenticated,
  onExit,
  footer,
}: {
  onAuthenticated: (info: { name: string; email: string; onboardingComplete: boolean }) => void;
  onExit?: () => void;
  footer?: React.ReactNode;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("signup");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [pendingEmail, setPendingEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, role: "RECRUITER", ...extra }),
    });
    return { status: res.status, data: await res.json() };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { status, data } = await call(mode, form);
      if (data.checkEmail || data.needsVerification) {
        setPendingEmail(form.email.trim().toLowerCase());
        setSentTo(data.sentTo ?? "your email");
        setMode("check");
        return;
      }
      if (!status.toString().startsWith("2") || !data.ok) throw new Error(data.error ?? "Sign-in failed");
      onAuthenticated({ name: data.accountName ?? form.name, email: form.email.trim().toLowerCase(), onboardingComplete: data.onboardingComplete });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await call("resend", { email: pendingEmail });
      setSentTo(data.sentTo ?? sentTo);
      toast({ title: "Verification email sent", description: `Check ${data.sentTo ?? sentTo} — the link expires in 24 hours.` });
    } catch {
      toast({ title: "Could not resend — try again in a minute.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (mode === "check") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <Card className="border-slate-200">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              <Mail className="h-6 w-6 text-teal-700" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Confirm your email</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              We sent a verification link to <span className="font-semibold text-slate-900">{sentTo}</span>.
              Open it to activate your recruiter account — then this page continues automatically.
            </p>
            <p className="mt-2 text-xs text-slate-400">The link expires in 24 hours. Didn&apos;t get it? Check spam or resend below.</p>
            <Button onClick={resend} disabled={busy} variant="outline" className="mt-5 w-full border-teal-700/30 text-teal-700 hover:bg-teal-50">
              {busy ? "Sending…" : "Resend verification email"}
            </Button>
            <button type="button" onClick={() => setMode("signin")} className="mt-4 w-full text-center text-xs text-slate-500 underline hover:text-teal-700">
              ← Back to sign in
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Card className="border-slate-200">
        <CardContent className="p-8">
          <div className="flex items-center gap-2 text-teal-700">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wide">Recruiter portal</span>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {mode === "signup"
              ? "Sign up with your work email — we'll send a confirmation link, then you'll complete your profile and land on the pipeline dashboard."
              : "Sign in with the email and password you registered with."}
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "signup" && (
              <div>
                <Label htmlFor="ap-name">Full name</Label>
                <Input id="ap-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" placeholder="Jordan Blake" required />
              </div>
            )}
            <div>
              <Label htmlFor="ap-email">Work email</Label>
              <Input id="ap-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" placeholder="you@agency.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            </div>
            <div>
              <Label htmlFor="ap-pass">Password</Label>
              <Input id="ap-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5" placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"} required />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full bg-teal-700 hover:bg-teal-800">
              {busy ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <LogIn className="mr-1.5 h-4 w-4" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
            className="mt-4 w-full text-center text-xs text-slate-500 underline hover:text-teal-700"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
          {footer && <div className="mt-3 border-t border-slate-100 pt-3 text-center">{footer}</div>}
          {onExit && (
            <button type="button" onClick={onExit} className="mt-3 w-full text-center text-xs text-slate-500 underline hover:text-teal-700">
              ← Back to site
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserCog } from "lucide-react";

// ── RecruiterOnboarding — the "tell us about you" step ─────────────
// Shown once after email verification, before the dashboard:
// name, phone, email (fixed), company, location — per product spec.

export function RecruiterOnboarding({
  me,
  onSaved,
  onSignOut,
}: {
  me: { name: string; email: string };
  onSaved: () => void;
  onSignOut: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: me.name,
    phone: "",
    company: "",
    jobTitle: "",
    city: "",
    state: "",
    zip: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onboard_recruiter", role: "RECRUITER", ...form }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not save your profile");
      toast({ title: "Profile saved", description: "Welcome to VaultVerify — your pipeline dashboard is ready." });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <Card className="border-slate-200">
        <CardContent className="p-8">
          <div className="flex items-center gap-2 text-teal-700">
            <UserCog className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wide">Complete your profile</span>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">One last step, {me.name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tell us who you recruit for and where you&apos;re based — this is how candidates and references see you.
          </p>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <div className="sm:col-span-2">
              <Label htmlFor="ob-name">Full name</Label>
              <Input id="ob-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ob-email">Email (verified)</Label>
              <Input id="ob-email" value={me.email} disabled className="mt-1.5 bg-slate-50 text-slate-500" />
            </div>
            <div>
              <Label htmlFor="ob-phone">Phone number</Label>
              <Input id="ob-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" placeholder="(555) 123-4567" required />
            </div>
            <div>
              <Label htmlFor="ob-title">Job title <span className="text-slate-400">(optional)</span></Label>
              <Input id="ob-title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className="mt-1.5" placeholder="Senior Recruiter" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ob-company">Company / agency</Label>
              <Input id="ob-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1.5" placeholder="MEDS Talent" required />
            </div>
            <div>
              <Label htmlFor="ob-city">City</Label>
              <Input id="ob-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1.5" placeholder="Dallas" required />
            </div>
            <div>
              <Label htmlFor="ob-state">State</Label>
              <Input id="ob-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1.5" placeholder="TX" maxLength={20} required />
            </div>
            <div>
              <Label htmlFor="ob-zip">ZIP <span className="text-slate-400">(optional)</span></Label>
              <Input id="ob-zip" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="mt-1.5" placeholder="75201" />
            </div>
            {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy} className="w-full bg-teal-700 hover:bg-teal-800">
                {busy ? "Saving…" : "Save & open dashboard"}
              </Button>
            </div>
          </form>
          <button type="button" onClick={onSignOut} className="mt-4 w-full text-center text-xs text-slate-500 underline hover:text-teal-700">
            Sign out
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

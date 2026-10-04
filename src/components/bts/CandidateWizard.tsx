"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SPECIALTIES, NURSE_ROLES, specialtyLabel } from "@/lib/bts/constants";
import { AgencyLogo, Spinner } from "./brand";
import { ArrowLeft, ArrowRight, Send, CheckCircle2, Wand2, Lock, UserRound, Users, FileSignature } from "lucide-react";

interface RefDraft {
  refName: string; refTitle: string; refEmail: string; refPhone: string;
  facilityName: string; facilityCity: string; facilityState: string;
  relationship: string; relationshipOther?: string; workStartDate: string; workEndDate: string;
}

const emptyRef = (): RefDraft => ({
  refName: "", refTitle: "", refEmail: "", refPhone: "",
  facilityName: "", facilityCity: "", facilityState: "",
  relationship: "", relationshipOther: "", workStartDate: "", workEndDate: "",
});

const RELATIONSHIPS = ["Direct supervisor", "Charge nurse / team lead", "Peer colleague on same unit", "Educator / preceptor", "Other working relationship"];

export interface CreatedCandidate {
  id: string;
  fullName: string;
  email: string;
  requests: { id: string; refName: string; refEmail: string; status: string; refLink: string; callbackCode: string }[];
}

export function CandidateWizard({ agency, onDone, onBack, initial }: { agency: AgencyLike; onDone: (c: CreatedCandidate) => void; onBack: () => void; initial?: { name?: string; email?: string; role?: string } }) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedCandidate | null>(null);

  // profile — pre-filled when launched from the nurse portal so the created
  // reference profile matches the signed-in account email
  const [profile, setProfile] = useState({ fullName: initial?.name ?? "", email: initial?.email ?? "", phone: "", role: initial?.role ?? "RN", specialty: "", yearsExperience: "3", city: "", state: "", licenseNumber: "" });
  // NOTE: skills are NOT collected here — the skills checklist is a separate
  // self-assessment feature completed in the Skills Checklist portal.
  // References are requested ONE AT A TIME — a single referee per request.
  // Candidates add more (no limit) from the portal's References section.
  const [ref, setRef] = useState<RefDraft>(emptyRef());
  const [consent, setConsent] = useState({ agreed: false, signature: "" });

  const setP = (k: keyof typeof profile, v: string) => setProfile((p) => ({ ...p, [k]: v }));
  const setF = (k: keyof RefDraft, v: string) => setRef((r) => ({ ...r, [k]: v }));

  const validateProfile = () => {
    if (!profile.fullName.trim() || !profile.email.trim() || !profile.specialty) return "Name, email, and specialty are required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return "Enter a valid email address.";
    return null;
  };
  const validateRefs = () => {
    if (!ref.refName.trim() || !ref.refTitle.trim() || !ref.refEmail.trim() || !ref.facilityName.trim() || !ref.relationship) return "Name, title, email, facility, and relationship are required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ref.refEmail)) return "Enter a valid email for the reference.";
    return null;
  };

  const next = () => {
    if (step === 0) {
      const err = validateProfile();
      if (err) return toast({ title: err, variant: "destructive" });
    }
    if (step === 1) {
      const err = validateRefs();
      if (err) return toast({ title: err, variant: "destructive" });
    }
    setStep((s) => Math.min(s + 1, 2));
  };

  const demoFill = () => {
    setProfile({ fullName: "Dana Whitfield", email: `dana.whitfield+${Math.floor(Math.random() * 9000 + 1000)}@example.com`, phone: "(720) 555-0134", role: "RN", specialty: "ICU", yearsExperience: "4", city: "Denver", state: "CO", licenseNumber: "CO-RN-77120" });
    setRef({ ...emptyRef(), refName: "Marcus Bell", refTitle: "ICU Nurse Manager", refEmail: "mbell@denverhealth.org", refPhone: "(720) 555-0161", facilityName: "Denver Health", facilityCity: "Denver", facilityState: "CO", relationship: "Direct supervisor", workStartDate: "2022-08", workEndDate: "" });
    setConsent({ agreed: true, signature: "Dana Whitfield" });
    toast({ title: "Demo data filled", description: "Review each step and continue." });
  };

  const submit = async () => {
    if (!consent.agreed || consent.signature.trim().length < 3) {
      return toast({ title: "Please check the release box and type your full name to sign.", variant: "destructive" });
    }
    setSubmitting(true);
    try {
      // merge the free-text "Other" working relationship into the stored value
      const refPayload = { ...ref };
      if (refPayload.relationship === "Other working relationship" && refPayload.relationshipOther?.trim()) {
        refPayload.relationship = `Other — ${refPayload.relationshipOther.trim()}`;
      }
      delete refPayload.relationshipOther;
      const res = await fetch("/api/candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          yearsExperience: Number(profile.yearsExperience) || 0,
          consentSignature: consent.signature.trim(),
          skills: [],
          references: [refPayload],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setCreated(data.candidate);
      toast({ title: "Request sent", description: "Your reference received a secure SMS + email invite." });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──
  if (created) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card className="border-teal-200">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
            <h2 className="mt-4 text-2xl font-bold text-slate-900">Your request is on its way</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {created.fullName}, your reference{created.requests.length > 1 ? "s" : ""} received a branded SMS + email with a secure link (expires in 14 days).
              Reminders go out automatically at day 2, 5, and 9. In the sandbox, notifications are simulated — use the link{created.requests.length > 1 ? "s" : ""} below to play the reference.
            </p>
            <div className="mt-6 space-y-3 text-left">
              {created.requests.map((r, i) => (
                <div key={r.id} className="rounded-lg border bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{created.requests.length > 1 ? `Reference ${i + 1}: ` : ""}{r.refName}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">Secure link: {r.refLink}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Phone callback code: <span className="font-mono font-semibold text-teal-700">{r.callbackCode}</span></p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a href={`/?r=${r.refLink.split("r=")[1]}`}>Open reference form (demo)</a>
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-5 rounded-lg border border-teal-100 bg-teal-50 p-3 text-xs leading-relaxed text-teal-800">
              Collecting more references? There&apos;s no limit — request them one at a time from your dashboard&apos;s References section.
            </p>
            <Button className="mt-6 w-full bg-teal-700 hover:bg-teal-800" onClick={() => onDone(created)}>
              Go to my dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const steps = [
    { label: "Profile", icon: UserRound },
    { label: "Reference", icon: Users },
    { label: "Consent & send", icon: FileSignature },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <AgencyLogo logoText={agency.logoText} name={agency.name} />
        <Button variant="ghost" size="sm" onClick={onBack}>← Home</Button>
      </div>

      {/* Stepper */}
      <ol className="mt-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <div className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium", i === step ? "border-teal-700 bg-teal-50 text-teal-800" : i < step ? "border-teal-200 bg-white text-teal-700" : "border-slate-200 bg-white text-slate-400")}>
              <s.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < steps.length - 1 && <div className={cn("h-px flex-1", i < step ? "bg-teal-300" : "bg-slate-200")} />}
          </li>
        ))}
      </ol>

      <Card className="mt-6 border-slate-200">
        <CardContent className="p-6">
          {/* ── Step 0: Profile ── */}
          {step === 0 && (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Your VaultVerify profile</h2>
                  <p className="mt-1 text-sm text-slate-600">This information is pulled into every reference packet — never retyped by anyone.</p>
                </div>
                <Button variant="outline" size="sm" onClick={demoFill}>
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Fill demo data
                </Button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="fullName">Full name *</Label>
                  <Input id="fullName" value={profile.fullName} onChange={(e) => setP("fullName", e.target.value)} placeholder="Maya Rodriguez" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={profile.email} onChange={(e) => setP("email", e.target.value)} placeholder="you@example.com" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={profile.phone} onChange={(e) => setP("phone", e.target.value)} placeholder="(312) 555-0148" className="mt-1.5" />
                </div>
                <div>
                  <Label>Role *</Label>
                  <Select value={profile.role} onValueChange={(v) => setP("role", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{NURSE_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Specialty / unit *</Label>
                  <Select
                    value={profile.specialty}
                    onValueChange={(v) => setP("specialty", v)}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent>
                      {SPECIALTIES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="years">Years of experience</Label>
                  <Input id="years" type="number" min="0" value={profile.yearsExperience} onChange={(e) => setP("yearsExperience", e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="license">License number</Label>
                  <Input id="license" value={profile.licenseNumber} onChange={(e) => setP("licenseNumber", e.target.value)} placeholder="IL-RN-441320" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={profile.city} onChange={(e) => setP("city", e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={profile.state} onChange={(e) => setP("state", e.target.value)} placeholder="IL" className="mt-1.5" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Reference — one referee per request ── */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Request a reference</h2>
              <p className="mt-1 text-sm text-slate-600">
                One request per referee — pick a supervisor or charge nurse who saw your clinical work directly. They can correct details if anything is off.
                Once this one is sent, you can request as many more as you like, one at a time, from your dashboard — there&apos;s no limit.
              </p>
              <div className="mt-5 rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-teal-800">Who are you asking?</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Name *</Label>
                    <Input value={ref.refName} onChange={(e) => setF("refName", e.target.value)} placeholder="Daniel Okafor" className="mt-1" />
                  </div>
                  <div>
                    <Label>Title *</Label>
                    <Input value={ref.refTitle} onChange={(e) => setF("refTitle", e.target.value)} placeholder="ICU Nurse Manager" className="mt-1" />
                  </div>
                  <div>
                    <Label>Work email *</Label>
                    <Input type="email" value={ref.refEmail} onChange={(e) => setF("refEmail", e.target.value)} placeholder="d.okafor@hospital.org" className="mt-1" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={ref.refPhone} onChange={(e) => setF("refPhone", e.target.value)} placeholder="(312) 555-0177" className="mt-1" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Facility *</Label>
                    <Input value={ref.facilityName} onChange={(e) => setF("facilityName", e.target.value)} placeholder="St. Mary's Medical Center" className="mt-1" />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={ref.facilityCity} onChange={(e) => setF("facilityCity", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={ref.facilityState} onChange={(e) => setF("facilityState", e.target.value)} className="mt-1" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Working relationship *</Label>
                    <Select value={ref.relationship} onValueChange={(v) => setF("relationship", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="How do/did you work together?" /></SelectTrigger>
                      <SelectContent>{RELATIONSHIPS.map((rel) => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}</SelectContent>
                    </Select>
                    {ref.relationship === "Other working relationship" && (
                      <div className="mt-2">
                        <Label className="text-xs text-slate-500">Describe the working relationship</Label>
                        <Input value={ref.relationshipOther ?? ""} onChange={(e) => setF("relationshipOther", e.target.value)} placeholder="e.g. HR director overseeing their contract" className="mt-1" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Start (month/year)</Label>
                    <Input value={ref.workStartDate} onChange={(e) => setF("workStartDate", e.target.value)} placeholder="2023-06" className="mt-1" />
                  </div>
                  <div>
                    <Label>End (blank = current)</Label>
                    <Input value={ref.workEndDate} onChange={(e) => setF("workEndDate", e.target.value)} placeholder="present" className="mt-1" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Consent ── */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Consent, release & send</h2>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                <p className="font-semibold text-slate-900">Reference Request Authorization & Release</p>
                <p className="mt-2">
                  I authorize {agency.name} to contact the professional reference listed above — and any others I request through VaultVerify — regarding my employment
                  history, clinical performance, and professional conduct. I understand the completed references are used to verify my employment and capabilities.
                  I release all parties from liability for information provided in good faith. This consent is stored with my profile before any outreach is made.
                </p>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <Checkbox id="consent" checked={consent.agreed} onCheckedChange={(v) => setConsent((c) => ({ ...c, agreed: v === true }))} className="mt-0.5" />
                <Label htmlFor="consent" className="text-sm font-normal leading-snug text-slate-700">
                  I have read and agree to the authorization & release above.
                </Label>
              </div>
              <div className="mt-5">
                <Label htmlFor="signature">Type your full name to sign *</Label>
                <Input id="signature" value={consent.signature} onChange={(e) => setConsent((c) => ({ ...c, signature: e.target.value }))} placeholder="Your full legal name" className="mt-1.5 font-serif text-lg italic" />
              </div>
              <Separator className="my-6" />
              <div className="rounded-lg border bg-white p-4 text-sm">
                <p className="font-medium text-slate-900">On send:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-slate-600">
                  <li>Branded SMS first, email fallback — secure single-use link, expires in 14 days</li>
                  <li>Automated reminders at day 2, 5, and 9; swap/nudge prompt for you after day 10</li>
                  <li>Completed forms become a branded PDF + structured data on the recruiter board</li>
                </ul>
              </div>
            </div>
          )}

          {/* nav */}
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 2 ? (
              <Button onClick={next} className="bg-teal-700 hover:bg-teal-800">
                Continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting} className="bg-teal-700 hover:bg-teal-800">
                {submitting ? (
                  <span className="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {submitting ? "Sending…" : "Sign release & send requests"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <Lock className="h-3 w-3" /> Encrypted at rest · single-use tokens · immutable audit trail
      </p>
    </div>
  );
}

export interface AgencyLike {
  name: string;
  logoText: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
}

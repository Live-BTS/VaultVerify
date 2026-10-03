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
import { SPECIALTIES, NURSE_ROLES, PROFICIENCY_META, specialtyLabel, type ChecklistSkill } from "@/lib/bts/constants";
import { CHECKLISTS, RECENCY_OPTIONS, templateFor } from "@/lib/bts/questions";
import { AgencyLogo, Spinner } from "./brand";
import { ArrowLeft, ArrowRight, ClipboardList, Send, CheckCircle2, Wand2, Lock, UserRound, Users, FileSignature } from "lucide-react";

interface RefDraft {
  refName: string; refTitle: string; refEmail: string; refPhone: string;
  facilityName: string; facilityCity: string; facilityState: string;
  relationship: string; workStartDate: string; workEndDate: string;
}

const emptyRef = (): RefDraft => ({
  refName: "", refTitle: "", refEmail: "", refPhone: "",
  facilityName: "", facilityCity: "", facilityState: "",
  relationship: "", workStartDate: "", workEndDate: "",
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
  // skills: skillName -> {proficiency, recencyMonths}
  const [skills, setSkills] = useState<Record<string, { proficiency: string; recencyMonths: number }>>({});
  const [refs, setRefs] = useState<RefDraft[]>([emptyRef(), emptyRef()]);
  const [consent, setConsent] = useState({ agreed: false, signature: "" });

  const template = useMemo(() => (profile.specialty ? templateFor(profile.specialty) : null), [profile.specialty]);
  const hasTemplate = !!CHECKLISTS.find((c) => c.specialty === profile.specialty);

  const setP = (k: keyof typeof profile, v: string) => setProfile((p) => ({ ...p, [k]: v }));
  const setR = (i: number, k: keyof RefDraft, v: string) => setRefs((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  const applyTemplateDefaults = (specialty: string) => {
    const t = templateFor(specialty);
    const next: Record<string, { proficiency: string; recencyMonths: number }> = {};
    for (const s of t.skills) next[s.name] = { proficiency: "INDEPENDENT", recencyMonths: 1 };
    setSkills(next);
  };

  const validateProfile = () => {
    if (!profile.fullName.trim() || !profile.email.trim() || !profile.specialty) return "Name, email, and specialty are required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return "Enter a valid email address.";
    return null;
  };
  const validateRefs = () => {
    for (let i = 0; i < 2; i++) {
      const r = refs[i];
      if (!r.refName.trim() || !r.refTitle.trim() || !r.refEmail.trim() || !r.facilityName.trim() || !r.relationship) return `Reference ${i + 1}: name, title, email, facility, and relationship are required.`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.refEmail)) return `Reference ${i + 1}: enter a valid email.`;
    }
    return null;
  };

  const next = () => {
    if (step === 0) {
      const err = validateProfile();
      if (err) return toast({ title: err, variant: "destructive" });
      if (hasTemplate && Object.keys(skills).length === 0) applyTemplateDefaults(profile.specialty);
    }
    if (step === 2) {
      const err = validateRefs();
      if (err) return toast({ title: err, variant: "destructive" });
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const demoFill = () => {
    setProfile({ fullName: "Dana Whitfield", email: `dana.whitfield+${Math.floor(Math.random() * 9000 + 1000)}@example.com`, phone: "(720) 555-0134", role: "RN", specialty: "ICU", yearsExperience: "4", city: "Denver", state: "CO", licenseNumber: "CO-RN-77120" });
    applyTemplateDefaults("ICU");
    setRefs([
      { refName: "Marcus Bell", refTitle: "ICU Nurse Manager", refEmail: "mbell@denverhealth.org", refPhone: "(720) 555-0161", facilityName: "Denver Health", facilityCity: "Denver", facilityState: "CO", relationship: "Direct supervisor", workStartDate: "2022-08", workEndDate: "" },
      { refName: "Sofia Andres", refTitle: "Charge Nurse, SICU", refEmail: "s.andres@uchealth.org", refPhone: "(720) 555-0188", facilityName: "UCHealth", facilityCity: "Aurora", facilityState: "CO", relationship: "Charge nurse / team lead", workStartDate: "2020-03", workEndDate: "2022-06" },
    ]);
    setConsent({ agreed: true, signature: "Dana Whitfield" });
    toast({ title: "Demo data filled", description: "Review each step and continue." });
  };

  const submit = async () => {
    if (!consent.agreed || consent.signature.trim().length < 3) {
      return toast({ title: "Please check the release box and type your full name to sign.", variant: "destructive" });
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          yearsExperience: Number(profile.yearsExperience) || 0,
          consentSignature: consent.signature.trim(),
          skills: Object.entries(skills).map(([skillName, v]) => ({ skillName, proficiency: v.proficiency, recencyMonths: v.recencyMonths })),
          references: refs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setCreated(data.candidate);
      toast({ title: "Requests sent", description: "Your references received a secure SMS + email invite." });
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
            <h2 className="mt-4 text-2xl font-bold text-slate-900">Requests are on their way</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {created.fullName}, both references received a branded SMS + email with a secure link (expires in 14 days).
              Reminders go out automatically at day 2, 5, and 9. In the sandbox, notifications are simulated — use the links below to play the reference.
            </p>
            <div className="mt-6 space-y-3 text-left">
              {created.requests.map((r, i) => (
                <div key={r.id} className="rounded-lg border bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Reference {i + 1}: {r.refName}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">Secure link: {r.refLink}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Phone callback code: <span className="font-mono font-semibold text-teal-700">{r.callbackCode}</span></p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a href={`/?r=${r.refLink.split("r=")[1]}`}>Open reference form (demo)</a>
                  </Button>
                </div>
              ))}
            </div>
            <Button className="mt-8 w-full bg-teal-700 hover:bg-teal-800" onClick={() => onDone(created)}>
              Go to my dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const steps = [
    { label: "Profile", icon: UserRound },
    { label: "Skills", icon: ClipboardList },
    { label: "References", icon: Users },
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
                    onValueChange={(v) => {
                      setP("specialty", v);
                      applyTemplateDefaults(v);
                    }}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent>
                      {SPECIALTIES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                          {!CHECKLISTS.find((c) => c.specialty === s.key) && <span className="ml-1 text-xs text-slate-400">(checklist coming soon)</span>}
                        </SelectItem>
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

          {/* ── Step 1: Skills ── */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {hasTemplate ? `${template?.label} skills checklist` : "Skills checklist"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {hasTemplate
                  ? "Rate each skill honestly — your reference will be asked to verify the high-risk ones. These become your badges."
                  : `The ${specialtyLabel(profile.specialty)} template ships in week 5 of the roadmap. You can still send reference requests now — the skills step will be skipped.`}
              </p>
              {hasTemplate && (
                <div className="mt-5 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                  {template?.skills.map((s: ChecklistSkill) => (
                    <div key={s.name} className={cn("rounded-lg border p-3", s.highRisk ? "border-amber-200 bg-amber-50/60" : "border-slate-200")}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          {s.name}
                          {s.highRisk && <span className="ml-2 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">High-risk</span>}
                        </p>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {Object.entries(PROFICIENCY_META).map(([k, meta]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setSkills((sk) => ({ ...sk, [s.name]: { ...sk[s.name], proficiency: k } }))}
                            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", skills[s.name]?.proficiency === k ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-teal-400")}
                          >
                            {meta.short}
                          </button>
                        ))}
                        <select
                          aria-label={`Recency for ${s.name}`}
                          className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
                          value={skills[s.name]?.recencyMonths ?? 1}
                          onChange={(e) => setSkills((sk) => ({ ...sk, [s.name]: { ...sk[s.name], recencyMonths: Number(e.target.value) } }))}
                        >
                          {RECENCY_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: References ── */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add 2 professional references</h2>
              <p className="mt-1 text-sm text-slate-600">Pick managers or charge nurses who saw your clinical work directly. They can correct details if anything is off.</p>
              {refs.map((r, i) => (
                <div key={i} className="mt-5 rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-teal-800">Reference {i + 1}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Name *</Label>
                      <Input value={r.refName} onChange={(e) => setR(i, "refName", e.target.value)} placeholder="Daniel Okafor" className="mt-1" />
                    </div>
                    <div>
                      <Label>Title *</Label>
                      <Input value={r.refTitle} onChange={(e) => setR(i, "refTitle", e.target.value)} placeholder="ICU Nurse Manager" className="mt-1" />
                    </div>
                    <div>
                      <Label>Work email *</Label>
                      <Input type="email" value={r.refEmail} onChange={(e) => setR(i, "refEmail", e.target.value)} placeholder="d.okafor@hospital.org" className="mt-1" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={r.refPhone} onChange={(e) => setR(i, "refPhone", e.target.value)} placeholder="(312) 555-0177" className="mt-1" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Facility *</Label>
                      <Input value={r.facilityName} onChange={(e) => setR(i, "facilityName", e.target.value)} placeholder="St. Mary's Medical Center" className="mt-1" />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input value={r.facilityCity} onChange={(e) => setR(i, "facilityCity", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input value={r.facilityState} onChange={(e) => setR(i, "facilityState", e.target.value)} className="mt-1" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Working relationship *</Label>
                      <Select value={r.relationship} onValueChange={(v) => setR(i, "relationship", v)}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="How do/did you work together?" /></SelectTrigger>
                        <SelectContent>{RELATIONSHIPS.map((rel) => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Start (month/year)</Label>
                      <Input value={r.workStartDate} onChange={(e) => setR(i, "workStartDate", e.target.value)} placeholder="2023-06" className="mt-1" />
                    </div>
                    <div>
                      <Label>End (blank = current)</Label>
                      <Input value={r.workEndDate} onChange={(e) => setR(i, "workEndDate", e.target.value)} placeholder="present" className="mt-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 3: Consent ── */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Consent, release & send</h2>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                <p className="font-semibold text-slate-900">Reference Request Authorization & Release</p>
                <p className="mt-2">
                  I authorize {agency.name} to contact the professional references listed above regarding my employment history, clinical performance, and professional conduct.
                  I understand my self-reported skills checklist will be shared with my references for verification. I release all parties from liability for information
                  provided in good faith. This consent is stored with my profile before any outreach is made.
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
            {step < 3 ? (
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

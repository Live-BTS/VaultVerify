import { db } from "@/lib/db";
import { sendNotification } from "@/lib/bts/notifications";

// ── Email template system ─────────────────────────────────────────
// Every outbound email renders through here. A template = subject + full
// HTML body with {{variable}} placeholders. Built-in defaults live in this
// file (SYSTEM_TEMPLATES); a row in the EmailTemplate table with the same
// key OVERRIDES the default — editable from Superadmin → Templates.
//
// Rendering rules:
//   · {{var}} in subject → replaced with the RAW value (subjects are text)
//   · {{var}} in html    → replaced with the HTML-ESCAPED value
//   · unknown vars       → left as-is (so a partially-passed render is visible)
//   · a plain-text version is derived from the HTML (Brevo textContent)

export interface TemplateVars {
  [key: string]: string | number | undefined | null;
}

interface TemplateSpec {
  key: string;
  name: string;
  kind: "INVITE" | "REMINDER" | "SWAP_NOTICE" | "COMPLETION" | "CONSENT" | "AUTH" | "OTP" | "SECURITY";
  subject: string;
  html: string;
  description: string;
}

// ── Shared layout — table-based, inline styles only (email-client safe) ──
const INK = "#03363d";
const JADE = "#7cc118";
const MUTED = "#5b6b66";
const BORDER = "#d8e6da";
const BG = "#f4f9f5";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function layout(inner: string, opts: { footnote?: string } = {}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VaultVerify</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
    <tr><td style="padding:0 4px 14px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:20px;font-weight:bold;color:${INK};letter-spacing:0.5px;">Vault<span style="color:${JADE};">Verify</span></td>
        <td align="right" style="font-size:12px;color:${MUTED};">References, verified.<br/>Skills, proven.</td>
      </tr></table>
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="height:5px;background:${JADE};border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 36px 30px 36px;font-size:15px;line-height:1.6;color:${INK};">
${inner}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 8px 6px 8px;font-size:11.5px;line-height:1.55;color:${MUTED};text-align:center;">
      ${opts.footnote ?? "This is an automated message from VaultVerify — the reference and skills verification platform for healthcare recruiting."}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td align="center" bgcolor="${JADE}" style="border-radius:8px;">
    <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:bold;color:#0b2a12;text-decoration:none;border-radius:8px;">${esc(label)}</a>
  </td></tr></table>`;
}

function codeBox(code: string): string {
  return `<div style="margin:22px 0;text-align:center;">
    <div style="display:inline-block;background:${BG};border:1px solid ${BORDER};border-radius:10px;padding:16px 34px;font-size:34px;font-weight:bold;letter-spacing:10px;color:${INK};">${esc(code)}</div>
  </div>`;
}

const hr = `<div style="border-top:1px solid ${BORDER};margin:20px 0;"></div>`;
const p = (t: string) => `<p style="margin:0 0 14px 0;">${t}</p>`;
const muted = (t: string) => `<p style="margin:0 0 12px 0;font-size:12.5px;color:${MUTED};">${t}</p>`;
const h = (t: string) => `<h1 style="margin:0 0 16px 0;font-size:21px;line-height:1.35;color:${INK};">${t}</h1>`;

// ── The 10 built-in templates ─────────────────────────────────────
export const SYSTEM_TEMPLATES: TemplateSpec[] = [
  {
    key: "admin_otp",
    name: "Admin login code (OTP)",
    kind: "OTP",
    subject: "VaultVerify admin login code",
    description:
      "6-digit one-time code for superadmin console sign-in. Sent instantly, short-lived.\nVariables: {{code}} — the 6-digit code · {{expiryMinutes}} — code lifetime in minutes",
    html: layout(
      `${h("Your admin login code")}
      ${p("Use this one-time code to sign in to the VaultVerify admin console:")}${codeBox("{{code}}")}
      ${p(`This code expires in <b>{{expiryMinutes}} minutes</b>. If you request a new code, the previous one stops working immediately.`)}
      ${muted("Never share this code — anyone with it can access the admin console.")}`
    ),
  },
  {
    key: "email_verification",
    name: "Email verification (signup)",
    kind: "AUTH",
    subject: "Verify your VaultVerify email",
    description:
      "Sent after candidate or recruiter signup to confirm the email address.\nVariables: {{portal}} — 'candidate' or 'recruiter' · {{link}} — verification link · {{expiryHours}} — link lifetime in hours",
    html: layout(
      `${h("Welcome to VaultVerify")}
      ${p("Confirm this address to activate your {{portal}} account:")}
      ${button("{{link}}", "Verify my email")}
      ${muted("Or paste this link into your browser:<br>{{link}}")}
      ${hr}
      ${muted("The link expires in {{expiryHours}} hours. If you didn't sign up, you can safely ignore this email.")}`
    ),
  },
  {
    key: "team_invite",
    name: "Admin team invitation",
    kind: "AUTH",
    subject: "You have been added to the VaultVerify admin team",
    description:
      "Sent when the owner adds a new team member to the superadmin console.\nVariables: {{role}} — ADMIN or SUPPORT · {{email}} — the member's email · {{accessDescription}} — what the role can do · {{consoleHint}} — how to sign in",
    html: layout(
      `${h("You're on the admin team")}
      ${p("You have been granted <b>{{role}}</b> access to the VaultVerify superadmin console.")}
      ${p("{{accessDescription}}")}
      ${hr}
      ${p("{{consoleHint}}")}
      ${muted("If you were not expecting this email, you can safely ignore it.")}`
    ),
  },
  {
    key: "reference_invite",
    name: "Reference request (invitation)",
    kind: "INVITE",
    subject: "Reference request — {{candidateName}}",
    description:
      "Sent to a professional referee when a candidate lists them. The core outbound email.\nVariables: {{agencyName}} · {{candidateName}} · {{refName}} · {{link}} — secure reference form link · {{expiryDays}} — days the link stays open",
    html: layout(
      `${h("{{candidateName}} has listed you as a professional reference")}
      ${p("<b>{{agencyName}}</b> would like to verify your clinical experience with <b>{{candidateName}}</b> before moving forward with their application.")}
      ${p("It takes <b>3–5 minutes</b> on any phone — verify your identity, answer 10 short questions, and e-sign. No account or password needed.")}
      ${button("{{link}}", "Start the reference")}
      ${muted("Or paste this link into your browser:<br>{{link}}")}
      ${hr}
      ${muted("This secure link expires in {{expiryDays}} days and is meant only for {{refName}}.")}`
    ),
  },
  {
    key: "reference_reminder",
    name: "Reference reminder (nudge)",
    kind: "REMINDER",
    subject: "Reminder: reference for {{candidateName}}",
    description:
      "Friendly nudge to a referee whose form is still open. Sent by candidate nudges and the recruiter reminder sweep.\nVariables: {{agencyName}} · {{candidateName}} · {{refName}} · {{link}} · {{daysOpen}} — days since the request was sent",
    html: layout(
      `${h("A quick reminder")}
      ${p("<b>{{candidateName}}'s</b> reference form for <b>{{agencyName}}</b> is still waiting — it's been open for <b>{{daysOpen}} days</b>.")}
      ${p("It takes just 3–5 minutes on any phone, and your input directly helps their application.")}
      ${button("{{link}}", "Complete the reference")}
      ${muted("Or paste this link into your browser:<br>{{link}}")}
      ${hr}
      ${muted("This secure link is meant only for {{refName}}. If you're unable to respond, feel free to ignore this reminder.")}`
    ),
  },
  {
    key: "reference_withdrawn",
    name: "Reference withdrawn notice",
    kind: "SWAP_NOTICE",
    subject: "Reference request withdrawn",
    description:
      "Sent to a referee whose reference request was replaced by a new contact.\nVariables: {{candidateName}} · {{refName}}",
    html: layout(
      `${h("Reference request withdrawn")}
      ${p("<b>{{candidateName}}</b> has replaced this reference request with a different contact — no action is needed from you.")}
      ${p("If this is a surprise, reach out to the candidate directly. Thank you for being willing to help.")}`
    ),
  },
  {
    key: "checklist_invite",
    name: "Skills checklist invitation",
    kind: "INVITE",
    subject: "{{recruiterName}} requested your skills checklist",
    description:
      "Sent to a candidate when a recruiter requests their skills checklist. Works for both new candidates (set a password) and existing ones (find it in the Invites tab).\nVariables: {{recruiterName}} · {{organization}} — facility or agency · {{candidateName}} · {{setupLink}} — portal link with the invite attached",
    html: layout(
      `${h("Your skills checklist is requested")}
      ${p("Hi <b>{{candidateName}}</b> — <b>{{recruiterName}}</b> at <b>{{organization}}</b> has requested your skills checklist.")}
      ${p("Your email address is already confirmed — open the link below to set your password (first time) or sign in, and your requested checklist will be waiting in the <b>Invites</b> tab.")}
      ${button("{{setupLink}}", "Open my checklist")}
      ${muted("Or paste this link into your browser:<br>{{setupLink}}")}
      ${hr}
      ${muted("Complete it once — your checklist stays valid for 1 year and can be shared with any employer.")}`
    ),
  },
  {
    key: "reference_completed",
    name: "Reference completed notice",
    kind: "COMPLETION",
    subject: "Reference completed — {{candidateName}} ({{refName}})",
    description:
      "Internal notice that a referee finished (or was flagged during) a reference form.\nVariables: {{candidateName}} · {{refName}} · {{finalStatus}} — completed or flagged · {{rating}} — average rating",
    html: layout(
      `${h("Reference completed")}
      ${p("The reference from <b>{{refName}}</b> for <b>{{candidateName}}</b> was {{finalStatus}}.")}
      ${p("Average rating: <b>{{rating}}</b>.")}
      ${p("Open the recruiter dashboard to review the full verified reference and downloadable PDF.")}`
    ),
  },
  {
    key: "password_reset",
    name: "Password reset link",
    kind: "SECURITY",
    subject: "Reset your VaultVerify password",
    description:
      "Sent when platform support triggers a password reset for a user.\nVariables: {{link}} — set-new-password link · {{expiryMinutes}} — link lifetime in minutes",
    html: layout(
      `${h("Reset your password")}
      ${p("A password reset was requested for your VaultVerify account by platform support.")}
      ${button("{{link}}", "Set a new password")}
      ${muted("Or paste this link into your browser:<br>{{link}}")}
      ${hr}
      ${muted("The link expires in {{expiryMinutes}} minutes. If you weren't expecting this, ignore the email — your current password still works until the link is used. All other sessions are signed out when the reset completes.")}`
    ),
  },
  {
    key: "temp_password",
    name: "Temporary password",
    kind: "SECURITY",
    subject: "Your temporary VaultVerify password",
    description:
      "Sent when platform support issues a one-time temporary password.\nVariables: {{tempPassword}} — the one-time password · {{link}} — set-your-own-password link · {{expiryMinutes}} — link lifetime in minutes",
    html: layout(
      `${h("Your temporary password")}
      ${p("Platform support issued a temporary password for your VaultVerify account. Sign in with it once:")}${codeBox("{{tempPassword}}")}
      ${p("Then set your own password here (expires in {{expiryMinutes}} minutes):")}
      ${button("{{link}}", "Set my own password")}
      ${hr}
      ${muted("All previous sessions were signed out. If you weren't expecting this, contact the person who sent it before signing in.")}`
    ),
  },
];

export const TEMPLATE_INDEX: Record<string, TemplateSpec> = Object.fromEntries(SYSTEM_TEMPLATES.map((t) => [t.key, t]));

// ── Rendering ─────────────────────────────────────────────────────

async function resolveTemplate(key: string): Promise<TemplateSpec> {
  const fallback = TEMPLATE_INDEX[key];
  try {
    const row = await db.emailTemplate.findUnique({ where: { key } });
    if (row) {
      return {
        key,
        name: row.name || fallback?.name || key,
        kind: (fallback?.kind ?? "AUTH") as TemplateSpec["kind"],
        subject: row.subject,
        html: row.html,
        description: row.description || fallback?.description || "",
      };
    }
  } catch {
    // table missing / DB blip — fall through to the built-in default
  }
  if (!fallback) throw new Error(`Unknown email template key: ${key}`);
  return fallback;
}

function substitute(text: string, vars: TemplateVars, escapeHtml: boolean): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return match; // keep the placeholder visible
    return escapeHtml ? esc(String(v)) : String(v);
  });
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|td)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function renderEmail(
  key: string,
  vars: TemplateVars,
): Promise<{ subject: string; html: string; text: string; kind: TemplateSpec["kind"] }> {
  const spec = await resolveTemplate(key);
  const subject = substitute(spec.subject, vars, false);
  const html = substitute(spec.html, vars, true);
  return { subject, html, text: htmlToText(html), kind: spec.kind };
}

/** Render a template and send it as EMAIL. Returns the NotificationLog row. */
export async function sendTemplatedEmail(
  key: string,
  to: string,
  vars: TemplateVars,
  opts: { requestId?: string } = {},
) {
  const { subject, html, text, kind } = await renderEmail(key, vars);
  return sendNotification({
    channel: "EMAIL",
    kind,
    to,
    subject,
    body: text,
    html,
    templateKey: key,
    requestId: opts.requestId,
  });
}

/** Console listing: built-in defaults + any saved overrides. */
export async function listTemplates() {
  const overrides = await db.emailTemplate.findMany();
  const byKey = new Map(overrides.map((r) => [r.key, r]));
  return SYSTEM_TEMPLATES.map((t) => {
    const o = byKey.get(t.key);
    return {
      key: t.key,
      name: o?.name ?? t.name,
      kind: t.kind,
      description: o?.description ?? t.description,
      customized: !!o,
      updatedAt: o?.updatedAt?.toISOString() ?? null,
      updatedBy: o?.updatedBy ?? null,
    };
  });
}

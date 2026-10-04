import { db } from "@/lib/db";

// ── Notification service (standalone by design) ───────────────
// Built as an isolated module so Zipvault can reuse it later.
// Channel strategy: SMS first, email as fallback + for documents.
//
// Providers:
//  · EMAIL → Brevo transactional API when BREVO_API_KEY + BREVO_SENDER_EMAIL
//    are configured (production); otherwise simulated.
//  · SMS   → simulated everywhere until an SMS sender is provisioned
//    (Brevo/Twilio) — call sites and logs already treat it identically.
//
// Safety guard: recipients on example.com / example.org (sandbox demo
// addresses) NEVER send for real, even when Brevo is configured.
// Every message — sent or simulated — is persisted to NotificationLog.

export type Channel = "SMS" | "EMAIL";
export type Kind = "INVITE" | "REMINDER" | "SWAP_NOTICE" | "COMPLETION" | "CONSENT";

export interface SendPayload {
  channel: Channel;
  kind: Kind;
  to: string;
  subject?: string;
  body: string;
  requestId?: string;
}

interface Provider {
  send(p: SendPayload): Promise<{ status: "SENT" | "SIMULATED" | "FAILED"; provider: string }>;
}

// Sandbox provider — the default when no email provider is configured.
const sandboxProvider: Provider = {
  async send(p) {
    console.log(`[notify:${p.channel}] ${p.kind} -> ${p.to}: ${p.body.slice(0, 80)}`);
    return { status: "SIMULATED", provider: "sandbox" };
  },
};

// Brevo transactional email — live provider used when configured.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const TEST_DOMAINS = new Set(["example.com", "example.org"]);

function isTestRecipient(to: string): boolean {
  if (!to.includes("@")) return true; // phone numbers / non-email targets
  const domain = to.split("@")[1]?.toLowerCase().split(">")[0] ?? "";
  return TEST_DOMAINS.has(domain);
}

const brevoEmailProvider: Provider = {
  async send(p) {
    if (p.channel !== "EMAIL") {
      // SMS stays simulated until a sender is provisioned in Brevo/Twilio.
      console.log(`[notify:SMS] ${p.kind} -> ${p.to}: ${p.body.slice(0, 80)}`);
      return { status: "SIMULATED", provider: "sms-sandbox" };
    }
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!apiKey || !senderEmail) {
      console.log("[brevo] not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL) — simulating");
      return { status: "SIMULATED", provider: "brevo-unconfigured" };
    }
    if (isTestRecipient(p.to)) {
      console.log(`[brevo] sandbox guard: ${p.to} is a demo address — not sending`);
      return { status: "SIMULATED", provider: "brevo-demo-guard" };
    }
    try {
      const res = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: process.env.BREVO_SENDER_NAME || "VaultVerify", email: senderEmail },
          to: [{ email: p.to }],
          subject: p.subject || "VaultVerify notification",
          textContent: p.body,
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error(`[brevo] send failed (${res.status}): ${detail}`);
        return { status: "FAILED", provider: "brevo" };
      }
      return { status: "SENT", provider: "brevo" };
    } catch (e) {
      console.error("[brevo] send error", e);
      return { status: "FAILED", provider: "brevo" };
    }
  },
};

const provider: Provider = process.env.BREVO_API_KEY ? brevoEmailProvider : sandboxProvider;

export async function sendNotification(p: SendPayload) {
  const result = await provider.send(p);
  const log = await db.notificationLog.create({
    data: {
      channel: p.channel,
      kind: p.kind,
      to: p.to,
      subject: p.subject ?? "",
      body: p.body,
      requestId: p.requestId ?? null,
      status: result.status,
      provider: result.provider,
    },
  });
  return log;
}

export function inviteBody(agencyName: string, candidateName: string, link: string, expiryDays: number): string {
  return `${agencyName} reference request: ${candidateName} has listed you as a professional reference for a clinical role. It takes 3–5 minutes on any phone: verify your identity, answer 10 short questions, and e-sign. Secure link (expires in ${expiryDays} days, no login needed): ${link}`;
}

export function reminderBody(agencyName: string, candidateName: string, link: string, daysOpen: number): string {
  return `Friendly reminder (${daysOpen} days open): ${candidateName}'s ${agencyName} reference form is still waiting for you — 3–5 minutes on any phone. Secure link: ${link}`;
}

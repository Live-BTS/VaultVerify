import { db } from "@/lib/db";

// ── Notification service (standalone by design) ───────────────
// Built as an isolated module so Zipvault can reuse it later.
// Channel strategy: SMS first, email as fallback + for documents.
// In the sandbox both providers are SIMULATED — messages are persisted
// to NotificationLog so the whole flow is inspectable end-to-end.

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

// Sandbox provider — swap with Twilio/Sendgrid in production without
// touching call sites (this is the only file that changes).
const sandboxProvider: Provider = {
  async send(p) {
    console.log(`[notify:${p.channel}] ${p.kind} -> ${p.to}: ${p.body.slice(0, 80)}`);
    return { status: "SIMULATED", provider: "sandbox" };
  },
};

const provider: Provider = sandboxProvider;

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

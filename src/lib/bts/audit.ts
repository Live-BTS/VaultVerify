import { db } from "@/lib/db";

// ── Audit trail — every view, edit, and signature, timestamped ─

export interface AuditInput {
  actorType: "CANDIDATE" | "REFERENCE" | "RECRUITER" | "SYSTEM";
  actorId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

export async function logAudit(input: AuditInput) {
  try {
    await db.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? "",
        action: input.action,
        entity: input.entity ?? "",
        entityId: input.entityId ?? "",
        detail: JSON.stringify(input.detail ?? {}),
        ip: input.ip ?? "",
      },
    });
  } catch (e) {
    console.error("[audit] failed to write event", e);
  }
}

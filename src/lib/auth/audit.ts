import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Append-only audit log (Mission 3.5 P1). Every privileged mutation records WHO
// did WHAT to WHICH entity. Never throws — auditing must not break the action.

export interface AuditInput {
  userId?: string | null;
  actorType?: "user" | "client" | "system";
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actorType: input.actorType ?? "user",
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        meta: (input.meta ?? {}) as Prisma.InputJsonValue,
        ip: input.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write audit log:", (e as Error).message);
  }
}

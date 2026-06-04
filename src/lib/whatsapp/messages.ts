import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue/queue";
import { getWhatsAppProvider, WaButton } from "@/lib/whatsapp/provider";
import type { Prisma, WaKind } from "@prisma/client";

// WhatsApp send orchestration (Mission 4). Every outbound message is persisted
// FIRST (status queued) and delivery is ENQUEUED — the request path never makes
// an outbound HTTP call (Part 7). The worker calls deliverWaMessage.

export interface WaSendInput {
  toNumber: string | null;
  clientId?: string | null;
  candidateId?: string | null;
  jobId?: string | null;
  event: string; // candidate_submitted | screening_completed | reminder | …
  kind: WaKind; // template | interactive | text
  templateName?: string;
  body: string;
  buttons?: WaButton[];
  variables?: Record<string, string>;
}

/** Persist + enqueue an outbound WhatsApp message. Returns the WaMessage id. */
export async function enqueueWhatsApp(input: WaSendInput): Promise<string> {
  // Graceful degradation: no destination number → record as skipped, don't send.
  if (!input.toNumber) {
    const skipped = await prisma.waMessage.create({
      data: {
        direction: "outbound", kind: input.kind, status: "skipped", event: input.event,
        clientId: input.clientId ?? null, candidateId: input.candidateId ?? null, jobId: input.jobId ?? null,
        templateName: input.templateName ?? null, body: input.body,
        payload: { reason: "no_destination_number", buttons: input.buttons ?? [], variables: input.variables ?? {} } as unknown as Prisma.InputJsonValue,
      },
    });
    return skipped.id;
  }

  const msg = await prisma.waMessage.create({
    data: {
      direction: "outbound", kind: input.kind, status: "queued", event: input.event,
      toNumber: input.toNumber, clientId: input.clientId ?? null, candidateId: input.candidateId ?? null, jobId: input.jobId ?? null,
      templateName: input.templateName ?? null, body: input.body,
      payload: { buttons: input.buttons ?? [], variables: input.variables ?? {} } as unknown as Prisma.InputJsonValue,
    },
  });
  await enqueue("wa_send", { messageId: msg.id });
  return msg.id;
}

/** Worker-side delivery. Idempotent: a message already sent/delivered is skipped. */
export async function deliverWaMessage(messageId: string): Promise<{ status: string; externalId?: string }> {
  const msg = await prisma.waMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new Error(`wa_message ${messageId} not found`);
  if (msg.status === "sent" || msg.status === "delivered") return { status: msg.status, externalId: msg.externalId ?? undefined };
  if (!msg.toNumber) {
    await prisma.waMessage.update({ where: { id: msg.id }, data: { status: "skipped" } });
    return { status: "skipped" };
  }

  const provider = getWhatsAppProvider();
  const payload = (msg.payload ?? {}) as { buttons?: WaButton[]; variables?: Record<string, string> };
  let result;
  if (msg.kind === "interactive") {
    result = await provider.sendInteractiveButtons(msg.toNumber, msg.body ?? "", payload.buttons ?? []);
  } else if (msg.kind === "template") {
    result = await provider.sendTemplateMessage(msg.toNumber, msg.templateName ?? "generic", payload.variables ?? {});
  } else {
    result = await provider.sendTextMessage(msg.toNumber, msg.body ?? "");
  }

  await prisma.waMessage.update({
    where: { id: msg.id },
    data: { status: result.status, externalId: result.externalId || null, error: result.error ?? null },
  });
  if (result.status === "failed") throw new Error(result.error ?? "wa send failed"); // let the queue retry
  return { status: result.status, externalId: result.externalId };
}

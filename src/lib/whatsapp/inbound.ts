import { prisma } from "@/lib/db";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import { applyClientDecision, ClientDecision } from "@/lib/decisions";
import type { Prisma } from "@prisma/client";

// Inbound WhatsApp processing (Mission 4 Part 3 + Part 7). Idempotent: every
// provider message id is recorded in webhook_event under a unique (provider,
// externalId) constraint, so a re-delivered webhook is a no-op.

export interface InboundResult {
  processed: number;
  duplicates: number;
  decisions: { candidateId: string; jobId: string; decision: string; stage: string }[];
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}
function numbersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digits(a), db = digits(b);
  if (!da || !db) return true; // can't verify → don't block (dev/mock)
  return da.slice(-10) === db.slice(-10);
}

const VALID: ClientDecision[] = ["approve", "reject", "request_interview"];

export async function handleWhatsAppInbound(payload: unknown, ip?: string): Promise<InboundResult> {
  const provider = getWhatsAppProvider();
  const messages = provider.handleInboundWebhook(payload);
  const result: InboundResult = { processed: 0, duplicates: 0, decisions: [] };

  for (const m of messages) {
    // Idempotency gate: claim this provider message id exactly once.
    try {
      await prisma.webhookEvent.create({
        data: { provider: "whatsapp", externalId: m.messageId, type: m.type, payload: m as unknown as Prisma.InputJsonValue, status: "received" },
      });
    } catch {
      result.duplicates += 1; // unique violation -> already seen
      continue;
    }

    // Persist the inbound message.
    await prisma.waMessage.create({
      data: {
        direction: "inbound", kind: m.type === "button" ? "interactive" : "text", status: "received",
        fromNumber: m.fromNumber, body: m.text ?? null, externalId: m.messageId,
        payload: { buttonId: m.buttonId ?? null } as Prisma.InputJsonValue,
      },
    });

    let processedOk = true;
    let errorMsg: string | null = null;

    if (m.type === "button" && m.buttonId?.startsWith("decision:")) {
      const [, action, candidateId, jobId] = m.buttonId.split(":");
      if (VALID.includes(action as ClientDecision) && candidateId && jobId) {
        const job = await prisma.job.findUnique({ where: { id: jobId }, include: { client: true } });
        const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
        if (!job || !candidate) {
          processedOk = false; errorMsg = "candidate_or_job_not_found"; // permanent — keep claim, no retry
        } else if (!numbersMatch(job.client?.whatsappNumber, m.fromNumber)) {
          processedOk = false; errorMsg = "number_mismatch"; // permanent — sender is not this job's client
        } else {
          try {
            const d = await applyClientDecision({ candidateId, jobId, decision: action as ClientDecision, via: "whatsapp", ip });
            result.decisions.push({ candidateId, jobId, decision: d.decision, stage: d.stage });
          } catch (e) {
            // UNEXPECTED failure (e.g. transient DB): release the idempotency claim so
            // a provider retry can reprocess — never permanently drop an approval.
            await prisma.webhookEvent.delete({ where: { provider_externalId: { provider: "whatsapp", externalId: m.messageId } } }).catch(() => {});
            throw e;
          }
        }
      }
    }

    await prisma.webhookEvent.update({
      where: { provider_externalId: { provider: "whatsapp", externalId: m.messageId } },
      data: { status: processedOk ? "processed" : "failed", error: errorMsg, processedAt: new Date() },
    });
    result.processed += 1;
  }

  return result;
}

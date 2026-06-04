import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue/queue";

// Telegram sync + recruiter notifications (spec §7 / mission 2 item 5),
// now ASYNC (Mission 3.5 P4): the request path NEVER makes an outbound HTTP
// call. Telegram delivery is enqueued to the background queue; the worker sends.

export interface NotifyInput {
  channel: "telegram" | "recruiter";
  title: string;
  body: string;
  jobId?: string | null;
  candidateId?: string | null;
}

const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = () => process.env.TELEGRAM_CHAT_ID?.trim();

export function telegramConfigured(): boolean {
  return Boolean(botToken() && chatId());
}

/**
 * Persist a notification. Recruiter notifications are in-app (no external call).
 * Telegram notifications are recorded and ENQUEUED for background delivery —
 * never sent inline. Never throws.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (input.channel === "recruiter") {
      await prisma.notification.create({
        data: { channel: "recruiter", status: "sent", title: input.title, body: input.body, jobId: input.jobId ?? null, candidateId: input.candidateId ?? null },
      });
      return;
    }

    // telegram
    if (!telegramConfigured()) {
      await prisma.notification.create({
        data: { channel: "telegram", status: "skipped", title: input.title, body: input.body, jobId: input.jobId ?? null, candidateId: input.candidateId ?? null },
      });
      return;
    }
    const n = await prisma.notification.create({
      data: { channel: "telegram", status: "queued", title: input.title, body: input.body, jobId: input.jobId ?? null, candidateId: input.candidateId ?? null },
    });
    await enqueue("deliver_notification", { notificationId: n.id });
  } catch (e) {
    console.error("[notify] failed:", (e as Error).message);
  }
}

/** Fire both a telegram group sync and a recruiter notification for one event. */
export async function notifyBoth(input: Omit<NotifyInput, "channel">): Promise<void> {
  await Promise.all([notify({ ...input, channel: "telegram" }), notify({ ...input, channel: "recruiter" })]);
}

/** Worker-side: actually deliver a queued telegram notification. */
export async function deliverTelegramNotification(notificationId: string): Promise<{ messageId: string }> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n) throw new Error(`notification ${notificationId} not found`);
  if (n.channel !== "telegram") return { messageId: "" };
  try {
    const messageId = await sendTelegram(`*${n.title}*\n${n.body}`);
    await prisma.notification.update({ where: { id: n.id }, data: { status: "sent", externalRef: messageId } });
    return { messageId };
  } catch (e) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "failed", error: (e as Error).message } });
    throw e;
  }
}

async function sendTelegram(text: string): Promise<string> {
  const url = `https://api.telegram.org/bot${botToken()}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId(), text, parse_mode: "Markdown" }),
  });
  const json = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!json.ok) throw new Error(json.description ?? "telegram send failed");
  return String(json.result?.message_id ?? "");
}

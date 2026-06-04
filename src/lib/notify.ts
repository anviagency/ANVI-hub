import { prisma } from "@/lib/db";

// Telegram sync + recruiter notifications (spec §7 / mission item 5).
// Every notification is persisted to the `notification` table (a real, testable
// artifact). When TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are configured, the
// telegram-channel notifications are also pushed to the group via the Bot API.
// With no token, telegram notifications are recorded with status "skipped" so
// the rest of the system keeps working offline.

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
 * Persist a notification and (for telegram) attempt delivery. Never throws —
 * a failed notification must not break a pipeline transition.
 */
export async function notify(input: NotifyInput): Promise<void> {
  let status: "queued" | "sent" | "failed" | "skipped" = "queued";
  let externalRef: string | null = null;
  let error: string | null = null;

  if (input.channel === "telegram") {
    if (!telegramConfigured()) {
      status = "skipped";
    } else {
      try {
        const res = await sendTelegram(`*${input.title}*\n${input.body}`);
        status = "sent";
        externalRef = res;
      } catch (e) {
        status = "failed";
        error = (e as Error).message;
      }
    }
  } else {
    // Recruiter notifications are in-app; "sent" == persisted and available.
    status = "sent";
  }

  try {
    await prisma.notification.create({
      data: {
        channel: input.channel,
        status,
        title: input.title,
        body: input.body,
        jobId: input.jobId ?? null,
        candidateId: input.candidateId ?? null,
        externalRef,
        error,
      },
    });
  } catch (e) {
    console.error("[notify] failed to persist notification:", (e as Error).message);
  }
}

/** Fire both a telegram group sync and a recruiter notification for one event. */
export async function notifyBoth(input: Omit<NotifyInput, "channel">): Promise<void> {
  await Promise.all([
    notify({ ...input, channel: "telegram" }),
    notify({ ...input, channel: "recruiter" }),
  ]);
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

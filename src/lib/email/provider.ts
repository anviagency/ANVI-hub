import { prisma } from "@/lib/db";

// Minimal email channel (Mission 4 — reminders go "WhatsApp + email if available").
// Graceful: with no RESEND_API_KEY the email is recorded as "skipped" (still a
// real, auditable notification row); with a key it would send via Resend.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export interface EmailInput {
  to: string | null;
  subject: string;
  body: string;
  jobId?: string | null;
  candidateId?: string | null;
}

export async function sendEmail(input: EmailInput): Promise<{ status: "sent" | "skipped" | "failed" }> {
  if (!input.to) {
    await record(input, "skipped", "no_recipient");
    return { status: "skipped" };
  }
  if (!emailConfigured()) {
    await record(input, "skipped", "email_not_configured");
    return { status: "skipped" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "ANVI <noreply@anvi.example>", to: input.to, subject: input.subject, text: input.body }),
    });
    if (!res.ok) {
      await record(input, "failed", `http_${res.status}`);
      return { status: "failed" };
    }
    await record(input, "sent");
    return { status: "sent" };
  } catch (e) {
    await record(input, "failed", (e as Error).message);
    return { status: "failed" };
  }
}

async function record(input: EmailInput, status: "sent" | "skipped" | "failed", error?: string) {
  await prisma.notification
    .create({ data: { channel: "email", status, title: input.subject, body: input.body, jobId: input.jobId ?? null, candidateId: input.candidateId ?? null, error: error ?? null } })
    .catch(() => {});
}

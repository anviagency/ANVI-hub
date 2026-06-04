import { randomUUID } from "node:crypto";

// WhatsApp provider abstraction (Mission 4 Part 1). A mock provider is used for
// local/dev/test; a Meta WhatsApp Business API provider is interface-ready and
// activates only when credentials are present. No real keys are required.

export interface WaButton {
  id: string; // callback id we set, e.g. "decision:approve:<candidateId>:<jobId>"
  title: string; // <= 20 chars per WhatsApp limits
}

export interface OutboundResult {
  externalId: string;
  status: "sent" | "failed";
  error?: string;
}

export interface InboundMessage {
  fromNumber: string;
  messageId: string; // provider message id (for idempotency)
  type: "button" | "text" | "other";
  buttonId?: string; // the callback id of the tapped button
  text?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendTemplateMessage(to: string, templateName: string, variables: Record<string, string>): Promise<OutboundResult>;
  sendInteractiveButtons(to: string, body: string, buttons: WaButton[]): Promise<OutboundResult>;
  sendTextMessage(to: string, text: string): Promise<OutboundResult>;
  /** Returns the challenge string to echo back if verification passes, else null. */
  verifyWebhook(params: { mode?: string; token?: string; challenge?: string }): string | null;
  /** Parse a provider webhook payload into normalized inbound messages. */
  handleInboundWebhook(payload: unknown): InboundMessage[];
}

const verifyToken = () => process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "anvi-dev-verify";

// ---------------------------------------------------------------------------
// Mock provider — simulates successful sends, no network. Default everywhere.
// ---------------------------------------------------------------------------
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = "mock";
  isConfigured() {
    return true; // the mock is always "available"
  }
  async sendTemplateMessage(_to: string, _templateName: string, _variables: Record<string, string>): Promise<OutboundResult> {
    return { externalId: `mock-${randomUUID()}`, status: "sent" };
  }
  async sendInteractiveButtons(_to: string, _body: string, _buttons: WaButton[]): Promise<OutboundResult> {
    return { externalId: `mock-${randomUUID()}`, status: "sent" };
  }
  async sendTextMessage(_to: string, _text: string): Promise<OutboundResult> {
    return { externalId: `mock-${randomUUID()}`, status: "sent" };
  }
  verifyWebhook(params: { mode?: string; token?: string; challenge?: string }): string | null {
    if (params.mode === "subscribe" && params.token === verifyToken()) return params.challenge ?? "";
    return null;
  }
  handleInboundWebhook(payload: unknown): InboundMessage[] {
    return parseInbound(payload);
  }
}

// ---------------------------------------------------------------------------
// Meta WhatsApp Business API provider — real fetch, used only when configured.
// ---------------------------------------------------------------------------
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  private token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  private phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();

  isConfigured() {
    return Boolean(this.token && this.phoneId);
  }
  private url() {
    return `https://graph.facebook.com/v21.0/${this.phoneId}/messages`;
  }
  private async post(body: object): Promise<OutboundResult> {
    try {
      const res = await fetch(this.url(), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      });
      const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
      if (json.error) return { externalId: "", status: "failed", error: json.error.message };
      return { externalId: json.messages?.[0]?.id ?? "", status: "sent" };
    } catch (e) {
      return { externalId: "", status: "failed", error: (e as Error).message };
    }
  }
  async sendTemplateMessage(to: string, templateName: string, variables: Record<string, string>): Promise<OutboundResult> {
    const params = Object.values(variables).map((v) => ({ type: "text", text: v }));
    return this.post({ to, type: "template", template: { name: templateName, language: { code: "en" }, components: [{ type: "body", parameters: params }] } });
  }
  async sendInteractiveButtons(to: string, body: string, buttons: WaButton[]): Promise<OutboundResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    });
  }
  async sendTextMessage(to: string, text: string): Promise<OutboundResult> {
    return this.post({ to, type: "text", text: { body: text } });
  }
  verifyWebhook(params: { mode?: string; token?: string; challenge?: string }): string | null {
    if (params.mode === "subscribe" && params.token === verifyToken()) return params.challenge ?? "";
    return null;
  }
  handleInboundWebhook(payload: unknown): InboundMessage[] {
    return parseInbound(payload);
  }
}

/**
 * Parse both Meta-shaped payloads (entry[].changes[].value.messages[]) and the
 * simplified mock shape ({ messages: [...] }).
 */
export function parseInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const p = payload as Record<string, unknown>;
  // Collect message arrays from either shape.
  const metaMessages: unknown[] = [];
  const entries = (p?.entry as unknown[]) ?? [];
  for (const entry of entries) {
    const changes = ((entry as Record<string, unknown>)?.changes as unknown[]) ?? [];
    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as Record<string, unknown>;
      const msgs = (value?.messages as unknown[]) ?? [];
      for (const m of msgs) metaMessages.push(m);
    }
  }
  const direct = (p?.messages as unknown[]) ?? [];
  const all = [...metaMessages, ...direct];

  for (const raw of all) {
    const m = raw as Record<string, unknown>;
    const from = String(m.from ?? "");
    const id = String(m.id ?? randomUUID());
    if (m.type === "interactive" || m.interactive) {
      const interactive = (m.interactive as Record<string, unknown>) ?? {};
      const reply = (interactive.button_reply as Record<string, unknown>) ?? (m.button as Record<string, unknown>);
      out.push({ fromNumber: from, messageId: id, type: "button", buttonId: String(reply?.id ?? reply?.payload ?? ""), text: String(reply?.title ?? reply?.text ?? "") });
    } else if (m.type === "button" || m.button) {
      const b = (m.button as Record<string, unknown>) ?? {};
      out.push({ fromNumber: from, messageId: id, type: "button", buttonId: String(b.payload ?? b.id ?? ""), text: String(b.text ?? "") });
    } else if (m.type === "text" || m.text) {
      const t = (m.text as Record<string, unknown>) ?? {};
      out.push({ fromNumber: from, messageId: id, type: "text", text: String(t.body ?? m.text ?? "") });
    } else {
      out.push({ fromNumber: from, messageId: id, type: "other" });
    }
  }
  return out;
}

let cached: WhatsAppProvider | null = null;
export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  const configured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  cached = configured ? new MetaWhatsAppProvider() : new MockWhatsAppProvider();
  return cached;
}

export function resetWhatsAppProvider(): void {
  cached = null;
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
}

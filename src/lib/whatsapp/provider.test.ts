import { describe, it, expect } from "vitest";
import { MockWhatsAppProvider, parseInbound } from "./provider";

describe("MockWhatsAppProvider", () => {
  const p = new MockWhatsAppProvider();

  it("simulates successful sends with an external id", async () => {
    const r = await p.sendTextMessage("+100", "hi");
    expect(r.status).toBe("sent");
    expect(r.externalId).toMatch(/^mock-/);
    const b = await p.sendInteractiveButtons("+100", "pick", [{ id: "x", title: "X" }]);
    expect(b.status).toBe("sent");
  });

  it("verifies the webhook handshake only with the right token", () => {
    expect(p.verifyWebhook({ mode: "subscribe", token: "anvi-dev-verify", challenge: "C" })).toBe("C");
    expect(p.verifyWebhook({ mode: "subscribe", token: "wrong", challenge: "C" })).toBeNull();
  });
});

describe("parseInbound", () => {
  it("parses the Meta nested shape (button reply)", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ from: "1555", id: "wamid.1", type: "interactive", interactive: { button_reply: { id: "decision:approve:cand1:job1", title: "Approve" } } }] } }] }],
    };
    const msgs = parseInbound(payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("button");
    expect(msgs[0].buttonId).toBe("decision:approve:cand1:job1");
    expect(msgs[0].messageId).toBe("wamid.1");
  });

  it("parses the simplified mock shape (button + text)", () => {
    const msgs = parseInbound({
      messages: [
        { from: "1555", id: "m1", type: "button", button: { payload: "decision:reject:c:j", text: "Reject" } },
        { from: "1555", id: "m2", type: "text", text: { body: "hello" } },
      ],
    });
    expect(msgs[0].buttonId).toBe("decision:reject:c:j");
    expect(msgs[1].type).toBe("text");
    expect(msgs[1].text).toBe("hello");
  });
});

import { describe, it, expect } from "vitest";
import { canOfferTransition, isOfferStatus, OFFER_STATUSES, OFFER_STATUS_LABEL } from "./offers";

describe("offer status machine", () => {
  it("exposes all five statuses with labels", () => {
    expect(OFFER_STATUSES).toEqual(["draft", "sent", "accepted", "declined", "withdrawn"]);
    for (const s of OFFER_STATUSES) expect(OFFER_STATUS_LABEL[s]).toBeTruthy();
  });

  it("allows the happy path: draft → sent → accepted", () => {
    expect(canOfferTransition("draft", "sent")).toBe(true);
    expect(canOfferTransition("sent", "accepted")).toBe(true);
  });

  it("allows decline and withdraw from a sent offer", () => {
    expect(canOfferTransition("sent", "declined")).toBe(true);
    expect(canOfferTransition("sent", "withdrawn")).toBe(true);
  });

  it("allows re-sending a declined or withdrawn offer (re-negotiation)", () => {
    expect(canOfferTransition("declined", "sent")).toBe(true);
    expect(canOfferTransition("withdrawn", "sent")).toBe(true);
  });

  it("treats an accepted offer as terminal", () => {
    expect(canOfferTransition("accepted", "declined")).toBe(false);
    expect(canOfferTransition("accepted", "withdrawn")).toBe(false);
    expect(canOfferTransition("accepted", "sent")).toBe(false);
  });

  it("rejects illegal jumps", () => {
    expect(canOfferTransition("draft", "accepted")).toBe(false);
    expect(canOfferTransition("declined", "accepted")).toBe(false);
  });

  it("treats same-status as a no-op (idempotent)", () => {
    expect(canOfferTransition("sent", "sent")).toBe(true);
    expect(canOfferTransition("accepted", "accepted")).toBe(true);
  });

  it("validates offer status strings", () => {
    expect(isOfferStatus("accepted")).toBe(true);
    expect(isOfferStatus("bogus")).toBe(false);
  });
});

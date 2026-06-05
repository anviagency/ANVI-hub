import { describe, it, expect } from "vitest";
import { canTransition, isStage, STAGES, STAGE_LABEL } from "./pipeline";

describe("pipeline stage machine", () => {
  it("has all mission stages incl. the offer stage that closes the funnel", () => {
    expect(STAGES).toEqual(["new", "screened", "sent_to_client", "interview", "approved", "offer", "rejected", "hired"]);
    for (const s of STAGES) expect(STAGE_LABEL[s]).toBeTruthy();
  });

  it("allows the happy-path progression", () => {
    expect(canTransition("new", "screened")).toBe(true);
    expect(canTransition("screened", "sent_to_client")).toBe(true);
    expect(canTransition("sent_to_client", "interview")).toBe(true);
    expect(canTransition("interview", "approved")).toBe(true);
    expect(canTransition("approved", "hired")).toBe(true);
  });

  it("allows the offer tail: approved/interview → offer → hired", () => {
    expect(canTransition("approved", "offer")).toBe(true);
    expect(canTransition("interview", "offer")).toBe(true);
    expect(canTransition("sent_to_client", "offer")).toBe(true);
    expect(canTransition("offer", "hired")).toBe(true);
    expect(canTransition("offer", "rejected")).toBe(true);
    // Cannot offer to a brand-new candidate.
    expect(canTransition("new", "offer")).toBe(false);
  });

  it("allows a client to approve from any post-screening stage (Mission 5.1 P0)", () => {
    expect(canTransition("screened", "approved")).toBe(true);
    expect(canTransition("sent_to_client", "approved")).toBe(true);
    expect(canTransition("interview", "approved")).toBe(true);
  });

  it("allows rejection from any active stage", () => {
    expect(canTransition("new", "rejected")).toBe(true);
    expect(canTransition("sent_to_client", "rejected")).toBe(true);
    expect(canTransition("interview", "rejected")).toBe(true);
  });

  it("allows re-opening a rejected candidate", () => {
    expect(canTransition("rejected", "screened")).toBe(true);
  });

  it("rejects illegal jumps and post-hire moves", () => {
    expect(canTransition("new", "hired")).toBe(false);
    expect(canTransition("new", "approved")).toBe(false);
    expect(canTransition("hired", "interview")).toBe(false);
  });

  it("treats same-stage as a no-op (idempotent)", () => {
    expect(canTransition("screened", "screened")).toBe(true);
  });

  it("validates stage strings", () => {
    expect(isStage("interview")).toBe(true);
    expect(isStage("bogus")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { canTransition, isStage, STAGES, STAGE_LABEL } from "./pipeline";

describe("pipeline stage machine", () => {
  it("has all 7 mission stages", () => {
    expect(STAGES).toEqual(["new", "screened", "sent_to_client", "interview", "approved", "rejected", "hired"]);
    for (const s of STAGES) expect(STAGE_LABEL[s]).toBeTruthy();
  });

  it("allows the happy-path progression", () => {
    expect(canTransition("new", "screened")).toBe(true);
    expect(canTransition("screened", "sent_to_client")).toBe(true);
    expect(canTransition("sent_to_client", "interview")).toBe(true);
    expect(canTransition("interview", "approved")).toBe(true);
    expect(canTransition("approved", "hired")).toBe(true);
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

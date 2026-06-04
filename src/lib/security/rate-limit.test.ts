import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, resetRateLimiter } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimiter());

  it("allows up to the limit then blocks within the window", () => {
    const t0 = 1_000_000;
    const key = "k1";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 1000, t0).allowed).toBe(true);
    }
    const fourth = rateLimit(key, 3, 1000, t0);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const key = "k2";
    rateLimit(key, 1, 1000, 1000);
    expect(rateLimit(key, 1, 1000, 1500).allowed).toBe(false); // still in window
    expect(rateLimit(key, 1, 1000, 2001).allowed).toBe(true); // window passed
  });

  it("isolates keys", () => {
    expect(rateLimit("a", 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit("a", 1, 1000, 0).allowed).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { routeIntentDeterministic } from "./intent-router";

describe("routeIntentDeterministic", () => {
  const cases: [string, string][] = [
    ["Need a senior Python dev with React and AWS", "create_job"],
    ["match", "match_candidates"],
    ["find me people for the role", "match_candidates"],
    ["compare Vasya and Alex", "compare"],
    ["find candidates like Vasya but cheaper", "find_similar"],
    ["is Vasya still available?", "availability"],
    ["send top 5 to Andy", "submit"],
    ["who haven't I contacted?", "followup"],
    ["what's pending?", "followup"],
    ["what's happening with Andy?", "status"],
    // Mission 5.2 new intents
    ["explain why these candidates ranked highest", "explain"],
    ["summarize Artem", "summarize"],
    ["tell me about Sofia", "summarize"],
    ["share a client link for the role", "share"],
    ["create a portal link with the top 3", "share"],
    ["what should I do next?", "followup"],
  ];

  for (const [text, expected] of cases) {
    it(`routes "${text}" -> ${expected}`, () => {
      const r = routeIntentDeterministic(text);
      expect(r?.intent).toBe(expected);
    });
  }

  it("extracts names for compare", () => {
    const r = routeIntentDeterministic("compare Vasya and Alex");
    expect(r?.entities.names).toEqual(["Vasya", "Alex"]);
  });

  it("flags cheaper for find_similar", () => {
    const r = routeIntentDeterministic("find candidates similar to Vasya but cheaper");
    expect(r?.entities.cheaper).toBe(true);
  });

  it("treats a multi-line skill brief as create_job", () => {
    const r = routeIntentDeterministic("Senior Engineer\nReact\nNode.js\nPostgreSQL");
    expect(r?.intent).toBe("create_job");
  });
});

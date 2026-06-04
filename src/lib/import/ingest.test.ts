import { describe, it, expect } from "vitest";
import { dedupeKeyFor, normalizeAvailability, parseSkills, mapRow, deriveCareerStartYear } from "./ingest";

describe("deriveCareerStartYear (P2 fallback)", () => {
  const now = new Date("2026-06-04T00:00:00Z");
  it("derives a career-start year from total years", () => {
    expect(deriveCareerStartYear(8, now)).toBe(2018);
  });
  it("returns null when years are missing or zero", () => {
    expect(deriveCareerStartYear(null, now)).toBeNull();
    expect(deriveCareerStartYear(0, now)).toBeNull();
  });
});

describe("dedupeKeyFor", () => {
  it("prefers email (case-insensitive)", () => {
    expect(dedupeKeyFor({ email: "Vasya@Example.com", fullName: "Vasya" })).toBe("email:vasya@example.com");
  });
  it("falls back to name+country", () => {
    expect(dedupeKeyFor({ fullName: "Vasya Petrov", country: "Ukraine" })).toBe("name:vasya petrov|ukraine");
  });
  it("is stable across whitespace/case", () => {
    expect(dedupeKeyFor({ fullName: "  Vasya   Petrov ", country: "UKRAINE" })).toBe("name:vasya petrov|ukraine");
  });
  it("returns null when there is no name and no email", () => {
    expect(dedupeKeyFor({ country: "Ukraine" })).toBeNull();
  });
});

describe("normalizeAvailability", () => {
  it("maps free text to enum values", () => {
    expect(normalizeAvailability("Available now")).toBe("available");
    expect(normalizeAvailability("On hold")).toBe("on_hold");
    expect(normalizeAvailability("Currently placed")).toBe("placed");
    expect(normalizeAvailability("")).toBe("available");
  });
});

describe("parseSkills", () => {
  it("splits and canonicalizes", () => {
    expect(parseSkills("JS, react.js; postgres / Node")).toEqual(
      expect.arrayContaining(["JavaScript", "React", "PostgreSQL", "Node.js"])
    );
  });
  it("dedupes", () => {
    expect(parseSkills("React, react, REACT")).toEqual(["React"]);
  });
});

describe("mapRow", () => {
  const mapping = {
    fullName: "Name",
    email: "Email",
    country: "Country",
    clientRate: "Rate",
    skills: "Stack",
    availability: "Status",
  };
  it("maps a source row onto normalized fields", () => {
    const row = { Name: "Vasya Petrov", Email: "v@x.com", Country: "Ukraine", Rate: "$34/hr", Stack: "React, Node", Status: "available" };
    const c = mapRow(row, mapping)!;
    expect(c.fullName).toBe("Vasya Petrov");
    expect(c.email).toBe("v@x.com");
    expect(c.clientRate).toBe(34);
    expect(c.availability).toBe("available");
    expect(c.skills).toEqual(expect.arrayContaining(["React", "Node.js"]));
  });
  it("returns null when the name column is empty (unusable row)", () => {
    expect(mapRow({ Name: "", Email: "v@x.com" }, mapping)).toBeNull();
  });
});

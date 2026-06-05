import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareView } from "./ShareView";

// UI test: the client-facing share view renders client-safe data and lets the
// client act. fetch is mocked so this runs in jsdom with no server.

const PAYLOAD = {
  token: "t1",
  label: "Top picks — Full-Stack",
  job: { id: "j1", title: "Senior Full-Stack Developer", seniority: "Senior" },
  client: { name: "Andy", company: "Northwind SaaS" },
  candidates: [
    {
      id: "c1",
      name: "Artem Valkov",
      title: "Senior Full-Stack Developer",
      country: "Ukraine",
      english: "B2+",
      availability: "available",
      availabilityNote: "2 weeks",
      rate: 34,
      skills: ["React", "Node.js"],
      summary: "Strong senior full-stack.",
      matchScore: 92,
      recommendation: "strong",
      strengths: [{ text: "Covers all required skills", evidence: "React, Node" }],
      risks: [{ text: "1-month notice", severity: "low" }],
      sharedNotes: [],
      clientStatus: "pending",
      stage: "Sent to client",
    },
  ],
};

function mockFetch(getStatus = 200) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.endsWith("/decision")) {
      return { status: 200, json: async () => ({ ok: true, stage: "approved" }) } as unknown as Response;
    }
    return { status: getStatus, json: async () => (getStatus >= 400 ? { error: "gone" } : PAYLOAD) } as unknown as Response;
  });
}

describe("ShareView (UI)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders client-safe candidate details and a price (not cost)", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<ShareView token="t1" />);

    expect(await screen.findByText("Artem Valkov")).toBeTruthy();
    expect(screen.getByText("$34/hr")).toBeTruthy();
    expect(screen.getByText(/Covers all required skills/)).toBeTruthy();
    // Decision buttons + the client-side interview time picker (Mission 5.1 P3).
    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.getByText("Pick interview time")).toBeTruthy();
    expect(screen.getByText("Pass")).toBeTruthy();
  });

  it("posts a decision when the client approves", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<ShareView token="t1" />);

    fireEvent.click(await screen.findByText("Approve"));

    await waitFor(() => {
      const calledDecision = fetchMock.mock.calls.some(
        (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/decision")
      );
      expect(calledDecision).toBe(true);
    });
  });

  it("shows a friendly message for an invalid/expired link", async () => {
    vi.stubGlobal("fetch", mockFetch(410));
    render(<ShareView token="bad" />);
    expect(await screen.findByText(/no longer active|not valid/)).toBeTruthy();
  });
});

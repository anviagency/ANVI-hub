import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as jobsList } from "@/app/api/jobs/route";
import { authedGet, createTestUser, cleanupAuth } from "./auth-helper";

const P = "AUTHAPI";
const EMAIL = "authapi.user@test.example";

function loginReq(email: string, password: string) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("auth API (DB)", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await cleanupAuth(P);
    await prisma.user.create({ data: { email: EMAIL, name: `${P} User`, role: "recruiter", passwordHash: await hashPassword("correct-horse") } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await cleanupAuth(P);
  });

  it("logs in with correct credentials and sets a session cookie", async () => {
    const res = await login(loginReq(EMAIL, "correct-horse"));
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("rejects a wrong password with 401", async () => {
    const res = await login(loginReq(EMAIL, "nope"));
    expect(res.status).toBe(401);
  });

  it("rejects a missing session on /me and a protected route", async () => {
    const noCookie = new NextRequest("http://localhost/api/auth/me");
    expect((await me(noCookie)).status).toBe(401);
    const noAuthJobs = new NextRequest("http://localhost/api/jobs");
    expect((await jobsList(noAuthJobs)).status).toBe(401);
  });

  it("allows a recruiter but forbids a client on recruiter-only routes", async () => {
    const recruiter = await createTestUser("recruiter", P);
    const client = await createTestUser("client", P);
    expect((await jobsList(authedGet("http://localhost/api/jobs", recruiter.token))).status).toBe(200);
    expect((await jobsList(authedGet("http://localhost/api/jobs", client.token))).status).toBe(403);
  });

  it("writes an audit log on login", async () => {
    await login(loginReq(EMAIL, "correct-horse"));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const logs = await prisma.auditLog.findMany({ where: { userId: user.id, action: "login" } });
    expect(logs.length).toBeGreaterThan(0);
  });
});

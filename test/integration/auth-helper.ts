import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import type { Role } from "@prisma/client";

// Test helper: create a user + session and build authenticated NextRequests.

export async function createTestUser(role: Role = "recruiter", prefix = "AUTHTEST"): Promise<{ userId: string; token: string; email: string }> {
  const email = `${prefix.toLowerCase()}.${role}.${Math.round(Math.random() * 1e9)}@test.example`;
  const user = await prisma.user.create({
    data: { email, name: `${prefix} ${role}`, role, passwordHash: await hashPassword("test1234") },
  });
  const { token } = await createSession(user.id);
  return { userId: user.id, token, email };
}

export function authedPost(url: string, token: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
}

export function authedGet(url: string, token: string): NextRequest {
  return new NextRequest(url, { method: "GET", headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

export async function cleanupAuth(prefix = "AUTHTEST"): Promise<void> {
  await prisma.user.deleteMany({ where: { name: { startsWith: prefix } } });
}

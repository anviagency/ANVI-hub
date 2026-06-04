import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "client"
  );
}

// GET /api/clients — list clients with their open-job counts.
export async function GET() {
  const clients = await prisma.client.findMany({
    include: { _count: { select: { jobs: true, placements: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      initials: c.initials,
      country: c.country,
      portalSlug: c.portalSlug,
      jobs: c._count.jobs,
      placements: c._count.placements,
    })),
  });
}

const CreateClient = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  country: z.string().optional(),
  email: z.string().optional(),
  whatsappNumber: z.string().optional(),
});

// POST /api/clients — create a new client (used by the chat "new client" flow).
export async function POST(req: NextRequest) {
  const parsed = CreateClient.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client" }, { status: 400 });
  }
  const data = parsed.data;
  const initials = data.name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  // Ensure a unique portal slug.
  let slug = slugify(data.company ?? data.name);
  let n = 1;
  while (await prisma.client.findUnique({ where: { portalSlug: slug } })) {
    slug = `${slugify(data.company ?? data.name)}-${++n}`;
  }

  const client = await prisma.client.create({
    data: {
      name: data.name,
      company: data.company ?? null,
      country: data.country ?? null,
      email: data.email ?? null,
      whatsappNumber: data.whatsappNumber ?? null,
      initials,
      portalSlug: slug,
    },
  });
  return NextResponse.json({ client: { id: client.id, name: client.name, company: client.company } });
}

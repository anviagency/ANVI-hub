import { CandidatePortalView } from "@/components/CandidatePortalView";

export const dynamic = "force-dynamic";

export default async function CandidatePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CandidatePortalView token={token} />;
}

import { PackageView } from "@/components/PackageView";

export const dynamic = "force-dynamic";

export default async function PackagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PackageView token={token} />;
}

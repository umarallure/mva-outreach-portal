import { notFound } from "next/navigation";
import { SalesCopyWorkspace } from "@/components/sales-copy/SalesCopyWorkspace";
import {
  getAccountBySlugs,
  outreachAccounts,
} from "@/config/pipelines";
import { getSalesCopyWorkspace } from "@/lib/sales-copy";

type SalesCopyPageProps = {
  params: Promise<{
    owner: string;
    pipeline: string;
  }>;
  searchParams: Promise<{
    manage?: string;
  }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return outreachAccounts.map((account) => ({
    owner: account.ownerSlug,
    pipeline: account.pipelineSlug,
  }));
}

export default async function SalesCopyPage({ params, searchParams }: SalesCopyPageProps) {
  const { owner, pipeline: pipelineSlug } = await params;
  const account = getAccountBySlugs(owner, pipelineSlug);

  if (!account) {
    notFound();
  }

  const [{ manage }, workspace] = await Promise.all([
    searchParams,
    getSalesCopyWorkspace(account),
  ]);

  return <SalesCopyWorkspace manageMode={manage === "1"} workspace={workspace} />;
}

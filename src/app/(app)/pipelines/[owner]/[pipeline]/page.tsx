import { notFound } from "next/navigation";
import { PipelineWorkspace } from "@/components/pipeline/PipelineWorkspace";
import {
  getAccountBySlugs,
  outreachAccounts,
  toAccountWorkspaceView,
} from "@/config/pipelines";

type PipelinePageProps = {
  params: Promise<{
    owner: string;
    pipeline: string;
  }>;
};

export function generateStaticParams() {
  return outreachAccounts.map((account) => ({
    owner: account.ownerSlug,
    pipeline: account.pipelineSlug,
  }));
}

export default async function PipelinePage({ params }: PipelinePageProps) {
  const { owner, pipeline: pipelineSlug } = await params;
  const account = getAccountBySlugs(owner, pipelineSlug);

  if (!account) {
    notFound();
  }

  return <PipelineWorkspace pipeline={toAccountWorkspaceView(account)} />;
}

import { notFound } from "next/navigation";
import { CalendlySchedulingWorkspace } from "@/components/calendly/CalendlySchedulingWorkspace";
import { calendlyAccounts, getCalendlyAccountBySlug } from "@/config/calendly";
import { getCalendlyWorkspace } from "@/lib/calendly/storage";

type SchedulingPageProps = {
  params: Promise<{
    account: string;
  }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return calendlyAccounts.map((account) => ({
    account: account.slug,
  }));
}

export default async function SchedulingPage({ params }: SchedulingPageProps) {
  const { account: accountSlug } = await params;
  const account = getCalendlyAccountBySlug(accountSlug);

  if (!account) {
    notFound();
  }

  const workspace = await getCalendlyWorkspace(account);

  return <CalendlySchedulingWorkspace workspace={workspace} />;
}

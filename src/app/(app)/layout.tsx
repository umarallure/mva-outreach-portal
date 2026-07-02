import { AppShell } from "@/components/app/AppShell";
import { getCalendlyNavigation } from "@/config/calendly";
import { getAccountNavigation } from "@/config/pipelines";
import { requireOutreachAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await requireOutreachAccess();
  const navigation = getAccountNavigation();
  const schedulingNavigation = getCalendlyNavigation();

  return (
    <AppShell navigation={navigation} profile={profile} schedulingNavigation={schedulingNavigation}>
      {children}
    </AppShell>
  );
}

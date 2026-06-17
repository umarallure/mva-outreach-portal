import { AppShell } from "@/components/app/AppShell";
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

  return (
    <AppShell navigation={navigation} profile={profile}>
      {children}
    </AppShell>
  );
}

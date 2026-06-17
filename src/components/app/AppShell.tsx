"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AppUserProfile } from "@/lib/access";

type NavPipeline = {
  id: string;
  title: string;
  sidebarLabel: string;
  href: string;
  status: string;
};

type NavGroup = {
  ownerSlug: string;
  ownerName: string;
  pipelines: NavPipeline[];
};

type AppShellProps = {
  children: React.ReactNode;
  profile: AppUserProfile;
  navigation: NavGroup[];
};

const linkBase =
  "flex min-h-9 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AE4010]/30";

export function AppShell({ children, profile, navigation }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(navigation.map((group) => group.ownerSlug)));

  const userLabel = profile?.display_name || profile?.email || "Account";
  const initial = useMemo(() => userLabel.trim().charAt(0).toUpperCase() || "A", [userLabel]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const toggleGroup = (ownerSlug: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(ownerSlug)) next.delete(ownerSlug);
      else next.add(ownerSlug);
      return next;
    });
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="h-screen overflow-hidden bg-[#202020] text-[#e8e4e0]">
      {mobileOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <div className="flex h-full">
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-white/10 bg-[#171717] transition-all duration-300 lg:static ${
            sidebarCollapsed ? "w-16" : "w-72"
          } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div
            className={`flex h-16 items-center border-b border-white/10 ${
              sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
            }`}
          >
            <Link className="min-w-0" href="/dashboard">
              <Image
                alt="Accident Payments"
                className={sidebarCollapsed ? "h-10 w-auto" : "h-8 w-auto"}
                height={sidebarCollapsed ? 40 : 32}
                priority
                src={sidebarCollapsed ? "/assets/logo-collapse.png" : "/assets/logo.svg"}
                style={{ width: "auto" }}
                width={sidebarCollapsed ? 40 : 180}
              />
            </Link>
            {!sidebarCollapsed ? (
              <button
                aria-label="Collapse sidebar"
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/5 hover:text-white lg:flex"
                onClick={() => setSidebarCollapsed(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {sidebarCollapsed ? (
            <button
              aria-label="Expand sidebar"
              className="mx-auto mt-3 hidden h-9 w-9 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/5 hover:text-white lg:flex"
              onClick={() => setSidebarCollapsed(false)}
              type="button"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : null}

          <nav className="dash-scrollbar flex-1 overflow-y-auto px-2 py-3">
            <Link
              className={`${linkBase} ${
                isActive("/dashboard")
                  ? "border-[#AE4010]/25 bg-[#AE4010]/12 text-[#f4a261]"
                  : "text-white/62 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
              } ${sidebarCollapsed ? "justify-center px-0" : ""}`}
              href="/dashboard"
              title={sidebarCollapsed ? "Dashboard" : undefined}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed ? <span>Dashboard</span> : null}
            </Link>

            <div className="mt-4 space-y-2">
              {navigation.map((group) => {
                const expanded = openGroups.has(group.ownerSlug);
                const hasActiveChild = group.pipelines.some((pipeline) => isActive(pipeline.href));

                return (
                  <div key={group.ownerSlug}>
                    <button
                      className={`${linkBase} w-full ${
                        hasActiveChild
                          ? "border-white/10 bg-white/[0.04] text-white"
                          : "text-white/52 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                      } ${sidebarCollapsed ? "justify-center px-0" : "justify-between"}`}
                      onClick={() => toggleGroup(group.ownerSlug)}
                      title={sidebarCollapsed ? group.ownerName : undefined}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <UserCircle2 className="h-4 w-4 shrink-0" />
                        {!sidebarCollapsed ? <span className="truncate">{group.ownerName}</span> : null}
                      </span>
                      {!sidebarCollapsed ? (
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      ) : null}
                    </button>

                    {!sidebarCollapsed && expanded ? (
                      <div className="mt-1 space-y-1 pl-4">
                        {group.pipelines.map((pipeline) => (
                          <Link
                            className={`flex min-h-8 items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                              isActive(pipeline.href)
                                ? "border-[#AE4010]/25 bg-[#AE4010]/12 text-[#f4a261]"
                                : "border-transparent text-white/54 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                            }`}
                            href={pipeline.href}
                            key={pipeline.id}
                            onClick={() => setMobileOpen(false)}
                          >
                            <span className="truncate">{pipeline.sidebarLabel}</span>
                            {pipeline.status === "ready" ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            ) : (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                            )}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#1a1a1a] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Open navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/5 hover:text-white lg:hidden"
                onClick={() => setMobileOpen(true)}
                type="button"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-white">Outreach Portal</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                className="hidden h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-medium text-white/60 transition hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-white sm:flex"
                href="https://app.gologin.com"
                rel="noreferrer"
                target="_blank"
              >
                GoLogin
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                aria-label="Sign out"
                className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-2.5 text-xs font-medium text-white/60 transition hover:border-red-400/25 hover:bg-red-500/10 hover:text-white sm:px-3"
                onClick={handleSignOut}
                type="button"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px] text-white">
                  {initial}
                </span>
                <span className="hidden max-w-36 truncate sm:block">{userLabel}</span>
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}

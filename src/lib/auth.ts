import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasOutreachAccess, type AppUserProfile } from "@/lib/access";

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null as AppUserProfile };
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("user_id,email,display_name,role,account_status,is_super_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[auth] failed to load app_users profile", error.message);
    return { user, profile: null as AppUserProfile };
  }

  return { user, profile: (data as AppUserProfile) ?? null };
}

export async function requireOutreachAccess() {
  const current = await getCurrentUserProfile();

  if (!current.user) {
    redirect("/login");
  }

  if (!hasOutreachAccess(current.profile)) {
    redirect("/login?reason=role_blocked");
  }

  return current;
}

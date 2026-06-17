export type AppRole =
  | "super_admin"
  | "admin"
  | "lawyer"
  | "agent"
  | "accounts"
  | "broker"
  | "broker_member"
  | string;

export type AppUserProfile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole | null;
  account_status: string | null;
  is_super_admin?: boolean | null;
} | null;

export function hasOutreachAccess(profile: AppUserProfile) {
  return Boolean(
    profile?.is_super_admin ||
      profile?.role === "super_admin" ||
      profile?.role === "admin",
  );
}

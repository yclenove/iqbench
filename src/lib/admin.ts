import { IQBENCH_ADMINS } from "@/lib/linuxdo.creds";

/** 管理员：环境变量优先，否则用站点回退名单。 */
export function adminList() {
  return (process.env.IQBENCH_ADMINS || IQBENCH_ADMINS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user: { id?: string | null; email?: string | null; name?: string | null } | null) {
  if (!user) return false;
  const allow = adminList();
  if (!allow.length) return false;
  const bag = [user.id, user.email, user.name, user.email?.split("@")[0]]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return bag.some((x) => allow.includes(x));
}
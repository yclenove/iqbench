/** Comma-separated emails / user ids / linux.do usernames. Empty env still includes built-in owners. */
const BUILTIN_ADMINS = ["yclenove"];

export function adminList() {
  return [...BUILTIN_ADMINS, ...(process.env.IQBENCH_ADMINS || "").split(",")]
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

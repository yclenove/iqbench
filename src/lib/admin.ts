/** 管理员名单只来自环境变量 IQBENCH_ADMINS（逗号分隔：用户名 / 邮箱 / user id）。仓库不写死任何人。 */
export function adminList() {
  return (process.env.IQBENCH_ADMINS || "")
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
const AUTH = "https://connect.linux.do/oauth2/authorize";
const TOKEN = "https://connect.linux.do/oauth2/token";
const USER = "https://connect.linux.do/api/user";

function clientId() {
  return (process.env.LINUX_DO_CLIENT_ID || "").trim();
}

function clientSecret() {
  return (process.env.LINUX_DO_CLIENT_SECRET || "").trim();
}

export function linuxdoConfigured() {
  return Boolean(clientId() && clientSecret());
}

export function publicOrigin(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export function linuxdoRedirectUri(origin: string) {
  return `${origin.replace(/\/+$/, "")}/api/linuxdo/callback`;
}

export function linuxdoAuthorizeUrl(origin: string, state: string) {
  const u = new URL(AUTH);
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", linuxdoRedirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "user");
  u.searchParams.set("state", state);
  return u.toString();
}

export type LinuxdoProfile = {
  id: number;
  username: string;
  name?: string;
  active?: boolean;
  trust_level?: number;
  silenced?: boolean;
};

export async function linuxdoExchange(origin: string, code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: linuxdoRedirectUri(origin),
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const tok = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const tj = (await tok.json()) as { access_token?: string; error?: string };
  if (!tok.ok || !tj.access_token) throw new Error(tj.error || `token ${tok.status}`);
  const me = await fetch(USER, { headers: { Authorization: `Bearer ${tj.access_token}` } });
  const profile = (await me.json()) as LinuxdoProfile;
  if (!me.ok || !profile?.id) throw new Error("无法读取 LINUX DO 用户");
  return profile;
}

export function linuxdoAccount(profile: LinuxdoProfile) {
  return {
    email: `ld-${profile.id}@users.linux.do`,
    name: profile.username || profile.name || `ld-${profile.id}`,
  };
}

export function linuxdoAllowed(profile: LinuxdoProfile) {
  if (profile.silenced) return "账号已被禁言";
  if (profile.active === false) return "账号未激活";
  if ((profile.trust_level ?? 0) < 1) return "信任等级不足（需要 TL1+）";
  return null;
}

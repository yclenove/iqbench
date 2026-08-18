import { createFileRoute } from "@tanstack/react-router";
import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";
import { linuxdoAccount, linuxdoAllowed, linuxdoConfigured, linuxdoExchange, publicOrigin } from "@/lib/linuxdo";

function cookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  const hit = raw.split(/;\s*/).find((p) => p.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

async function secretPassword(email: string) {
  const key = process.env.BETTER_AUTH_SECRET || "iqbench-linuxdo";
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`linuxdo:${email}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function popupHtml(token: string | null, error?: string) {
  const msg = JSON.stringify({ source: "grok-auth-popup", token, error: error || undefined });
  return `<!doctype html><meta charset="utf-8"><title>LINUX DO</title>
<script>
var msg = ${msg};
try { if (window.opener) window.opener.postMessage(msg, window.location.origin); } catch (e) {}
if (window.opener) window.close();
else location.replace(${error ? '"/login?error=linuxdo"' : '"/"'});
</script>`;
}

export const Route = createFileRoute("/api/linuxdo/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!linuxdoConfigured()) return new Response("未配置 LINUX DO", { status: 501 });
        const code = url.searchParams.get("code") || "";
        const state = url.searchParams.get("state") || "";
        const expect = cookie(request, "iqbench_ld_state");
        const popup = state.endsWith(":1") || expect.endsWith(":1");
        if (!code || !state || state !== expect) {
          const html = popupHtml(null, "state");
          return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        try {
          const profile = await linuxdoExchange(publicOrigin(request), code);
          const deny = linuxdoAllowed(profile);
          if (deny) {
            return new Response(popup ? popupHtml(null, deny) : deny, {
              status: 403,
              headers: { "content-type": popup ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" },
            });
          }
          const { email, name } = linuxdoAccount(profile);
          const password = await secretPassword(email);
          try {
            await auth.api.signUpEmail({ body: { email, password, name } });
          } catch {
            /* already exists */
          }
          const signed = await auth.api.signInEmail({
            body: { email, password },
            asResponse: true,
          });
          const setCookies = typeof signed.headers.getSetCookie === "function" ? signed.headers.getSetCookie() : [];
          const token = cookieFromSet(setCookies, SESSION_TOKEN_COOKIE);
          const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          for (const c of setCookies) headers.append("Set-Cookie", c);
          headers.append("Set-Cookie", "iqbench_ld_state=; Path=/; Max-Age=0");
          if (!popup) {
            headers.set("Location", "/");
            return new Response(null, { status: 302, headers });
          }
          return new Response(popupHtml(token, token ? undefined : "no-session"), { headers });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "linuxdo failed";
          return new Response(popupHtml(null, msg), {
            status: 502,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      },
    },
  },
});

function cookieFromSet(list: string[], name: string) {
  for (const line of list) {
    if (line.startsWith(`${name}=`)) return decodeURIComponent(line.slice(name.length + 1).split(";")[0] || "");
  }
  return null;
}

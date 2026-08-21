import { createFileRoute } from "@tanstack/react-router";
import { linuxdoAuthorizeUrl, linuxdoConfigured, publicOrigin } from "@/lib/linuxdo";

function missingPage() {
  return `<!doctype html><meta charset="utf-8"><title>LINUX DO 未配置</title>
<body style="font:16px/1.5 system-ui;max-width:36rem;margin:12vh auto;padding:0 1.25rem">
<p>这台发布环境没有 LINUX DO 密钥。</p>
<p>在托管后台（Vercel / 本机 <code>.env</code>）加上：</p>
<pre style="background:#111;color:#eee;padding:12px;border-radius:8px">LINUX_DO_CLIENT_ID=…
LINUX_DO_CLIENT_SECRET=…
IQBENCH_ADMINS=你的L站用户名</pre>
<p>不要写进 Git。配好后<strong>重新部署</strong>才生效。</p>
<p><a href="/">回测评台</a></p>
</body>`;
}

export const Route = createFileRoute("/api/linuxdo/start")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!linuxdoConfigured()) {
          return new Response(missingPage(), {
            status: 501,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        const url = new URL(request.url);
        const origin = publicOrigin(request);
        const state = `${crypto.randomUUID()}:${url.searchParams.get("popup") === "1" ? "1" : "0"}`;
        const dest = linuxdoAuthorizeUrl(origin, state);
        return new Response(null, {
          status: 302,
          headers: {
            Location: dest,
            "Set-Cookie": `iqbench_ld_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`,
          },
        });
      },
    },
  },
});

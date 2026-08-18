import { createFileRoute } from "@tanstack/react-router";
import { linuxdoAuthorizeUrl, linuxdoConfigured, publicOrigin } from "@/lib/linuxdo";

export const Route = createFileRoute("/api/linuxdo/start")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!linuxdoConfigured()) {
          return Response.json({ error: "未配置 LINUX_DO_CLIENT_ID / LINUX_DO_CLIENT_SECRET" }, { status: 501 });
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

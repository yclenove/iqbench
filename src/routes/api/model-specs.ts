import { createFileRoute } from "@tanstack/react-router";
import { compactCatalog } from "@/lib/model-spec";

let memo: { at: number; body: string } | null = null;
const TTL = 6 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/model-specs")({
  server: {
    handlers: {
      GET: async () => {
        if (memo && Date.now() - memo.at < TTL) {
          return new Response(memo.body, {
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
          });
        }
        const res = await fetch("https://models.dev/api.json", {
          headers: { Accept: "application/json", "User-Agent": "Mengdeng/1.0" },
        });
        if (!res.ok) {
          return Response.json({ error: `models.dev ${res.status}` }, { status: 502 });
        }
        const raw = (await res.json()) as Record<string, { models?: Record<string, Record<string, unknown>> }>;
        const idx = compactCatalog(raw);
        const body = JSON.stringify({ n: Object.keys(idx).length, specs: idx });
        memo = { at: Date.now(), body };
        return new Response(body, {
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});

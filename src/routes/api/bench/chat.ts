import { createFileRoute } from "@tanstack/react-router";

function redact(text: string, secret: string) {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

export const Route = createFileRoute("/api/bench/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          baseUrl?: string;
          apiKey?: string;
          model?: string;
          messages?: Array<{ role: string; content: string }>;
        };
        const base = (body.baseUrl || "").replace(/\/+$/, "");
        const apiKey = body.apiKey || "";
        const model = body.model || "";
        const messages = body.messages || [];
        if (!base || !apiKey || !model) {
          return Response.json({ error: "缺少参数" }, { status: 400 });
        }

        const upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 Mengdeng/1.0",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0,
            max_tokens: 32768,
            max_completion_tokens: 32768,
            stream: true,
            reasoning_effort: "xhigh",
            reasoning: { effort: "xhigh" },
          }),
          signal: request.signal,
        });

        const ctype = upstream.headers.get("content-type") || "";
        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text();
          return Response.json(
            { error: redact(errText.slice(0, 400), apiKey) || `HTTP ${upstream.status}` },
            { status: 502 },
          );
        }

        if (!ctype.includes("text/event-stream") && !ctype.includes("ndjson")) {
          const raw = await upstream.text();
          return new Response(redact(raw, apiKey), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});

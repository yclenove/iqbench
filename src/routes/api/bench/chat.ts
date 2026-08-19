import { createFileRoute } from "@tanstack/react-router";
import { parseSlot } from "@/lib/effort";
import {
  looksResponsesOnly,
  responsesJsonToChat,
  responsesPayloadVariants,
  responsesSseToChat,
} from "@/lib/responses-bridge";

function redact(text: string, secret: string) {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

function parseErrJson(text: string) {
  const t = text.trim().replace(/^data:\s*/, "");
  try {
    const obj = JSON.parse(t) as { error?: unknown; message?: unknown };
    const err = obj.error;
    if (typeof err === "string" && err.trim()) return err.trim();
    if (err && typeof err === "object") {
      const rec = err as { message?: unknown; code?: unknown };
      const msg = typeof rec.message === "string" ? rec.message : "";
      const code = typeof rec.code === "string" ? rec.code : "";
      if (msg) return code ? `${code}: ${msg}` : msg;
    }
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  } catch {
    /* raw */
  }
  return "";
}

function upstreamMessage(raw: string, status: number) {
  const text = raw.trim();
  const fromJson = parseErrJson(text);
  if (fromJson) return fromJson;
  const dataLine = text.split(/\n/).find((l) => l.trim().startsWith("data:"));
  if (dataLine) {
    const nested = parseErrJson(dataLine);
    if (nested) return nested;
  }
  return text.slice(0, 400) || `HTTP ${status}`;
}

function payloadVariants(model: string, messages: unknown, cap: number, effort: string) {
  const tok = Math.min(131072, Math.max(1024, cap));
  const base = { model, messages, temperature: 0, stream: true };
  if (!effort || effort === "none") {
    return [
      { ...base, max_tokens: tok, max_completion_tokens: tok },
      { ...base, max_tokens: tok },
      { ...base, max_completion_tokens: Math.min(tok, 32768) },
    ];
  }
  return [
    { ...base, max_tokens: tok, max_completion_tokens: tok, reasoning_effort: effort, reasoning: { effort } },
    { ...base, max_tokens: tok, reasoning: { effort } },
    { ...base, max_tokens: tok, reasoning_effort: effort },
    { ...base, max_completion_tokens: Math.min(tok, 32768), reasoning: { effort } },
  ];
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
          maxTokens?: number;
          reasoningEffort?: string;
          apiStyle?: "auto" | "chat" | "responses";
        };
        const base = (body.baseUrl || "").replace(/\/+$/, "");
        const apiKey = body.apiKey || "";
        const slot = parseSlot(body.model || "");
        const model = slot.model;
        const effort = (body.reasoningEffort || slot.effort || "xhigh").toLowerCase();
        const messages = body.messages || [];
        const apiStyle = body.apiStyle === "chat" || body.apiStyle === "responses" ? body.apiStyle : "auto";
        if (!base || !apiKey || !model) {
          return Response.json({ error: "缺少参数" }, { status: 400 });
        }

        const cap = Math.min(262144, Math.max(4096, Number(body.maxTokens) || 131072));
        const headers = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 Mengdeng/1.0",
          Accept: "text/event-stream",
        };
        let lastRaw = "";
        let lastStatus = 400;
        let upstream: Response | null = null;
        const tryChat = apiStyle !== "responses";
        const tryResponses = apiStyle !== "chat";
        if (tryChat) {
          for (const payload of payloadVariants(model, messages, cap, effort)) {
            upstream = await fetch(`${base}/chat/completions`, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
              signal: request.signal,
            });
            if (upstream.ok && upstream.body) break;
            lastStatus = upstream.status;
            lastRaw = await upstream.text();
            const msg = parseErrJson(lastRaw) || lastRaw;
            const bad =
              lastStatus === 400 || /Invalid request|Param Incorrect|unsupported_parameter|unknown parameter/i.test(msg);
            if (!bad) break;
            upstream = null;
          }
        }

        if ((!upstream?.ok || !upstream.body) && tryResponses && (apiStyle === "responses" || looksResponsesOnly(lastStatus, lastRaw))) {
          for (const payload of responsesPayloadVariants(model, messages, cap, effort)) {
            upstream = await fetch(`${base}/responses`, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
              signal: request.signal,
            });
            if (upstream.ok && upstream.body) break;
            lastStatus = upstream.status;
            lastRaw = await upstream.text();
            const msg = parseErrJson(lastRaw) || lastRaw;
            const bad =
              lastStatus === 400 ||
              /Invalid request|Param Incorrect|unsupported_parameter|unknown parameter/i.test(msg);
            if (!bad) break;
            upstream = null;
          }
        }

        if (!upstream?.ok || !upstream.body) {
          const mapped = lastStatus === 400 ? 400 : 502;
          return Response.json(
            { error: redact(upstreamMessage(lastRaw, lastStatus), apiKey) },
            { status: mapped },
          );
        }

        const ctype = upstream.headers.get("content-type") || "";
        const viaResponses = new URL(upstream.url).pathname.includes("/responses");
        if (!ctype.includes("text/event-stream") && !ctype.includes("ndjson")) {
          const raw = redact(await upstream.text(), apiKey);
          if (viaResponses) {
            return Response.json(responsesJsonToChat(raw));
          }
          return new Response(raw, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const stream = viaResponses ? responsesSseToChat(upstream.body) : upstream.body;
        return new Response(stream, {
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
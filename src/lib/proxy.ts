import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NON_CHAT = [
  "imagine",
  "image",
  "video",
  "voice",
  "stt",
  "tts",
  "whisper",
  "embedding",
  "embed",
  "dall",
  "flux",
];

const TRAIL =
  /[-_.](xhigh|high|low|medium|mid|fast|slow|thinking|think|reasoning|reason|preview|latest|exp|experimental|beta|alpha|chat|instruct|turbo|search|online|tools?|vision|voice|realtime|mini|nano|pro|max|plus|lite|small|large|multi-agent|non|agent|\d+[kKmM]|20\d{2}-\d{2}-\d{2}|\d{8}|20\d{2}|\d{4})$/;

export function modelFamily(id: string) {
  let s = (id.split("/").pop() || id).toLowerCase();
  for (let i = 0; i < 10; i++) {
    const n = s.replace(TRAIL, "");
    if (n === s) break;
    s = n;
  }
  return s.replace(/[-_.]+$/, "") || id.toLowerCase();
}

function versionFloat(s: string) {
  const m = s.match(/(\d+\.\d+|\d+)/);
  return m ? Number(m[1]) : -1;
}

export function compareModels(a: { id: string; kind: string }, b: { id: string; kind: string }) {
  if (a.kind !== b.kind) return a.kind === "chat" ? -1 : 1;
  const fa = modelFamily(a.id);
  const fb = modelFamily(b.id);
  const va = fa.replace(/[\d.].*$/, "").replace(/[-_.]+$/, "") || fa;
  const vb = fb.replace(/[\d.].*$/, "").replace(/[-_.]+$/, "") || fb;
  if (va !== vb) return va.localeCompare(vb);
  const na = versionFloat(fa);
  const nb = versionFloat(fb);
  if (na !== nb) return nb - na;
  if (fa !== fb) return fa.localeCompare(fb, undefined, { numeric: true });
  const ia = a.id.toLowerCase();
  const ib = b.id.toLowerCase();
  if (ia === fa && ib !== fb) return -1;
  if (ib === fb && ia !== fa) return 1;
  if (ia.length !== ib.length) return ia.length - ib.length;
  return ia.localeCompare(ib, undefined, { numeric: true });
}

const creds = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
});

async function httpJson(
  method: string,
  url: string,
  apiKey: string,
  payload: unknown,
  timeoutMs: number,
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 Mengdeng/1.0",
      },
      body: payload == null ? undefined : JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
    }
    if (!res.ok) {
      const err = (json as { error?: unknown }).error;
      throw new Error(
        typeof err === "string"
          ? err
          : `HTTP ${res.status}: ${text.slice(0, 240)}`,
      );
    }
    return json as Record<string, unknown>;
  } finally {
    clearTimeout(t);
  }
}

export const listModels = createServerFn({ method: "POST" })
  .validator(creds.parse)
  .handler(async ({ data }) => {
    const base = data.baseUrl.replace(/\/+$/, "");
    const resp = await httpJson("GET", `${base}/models`, data.apiKey, null, 30000);
    const raw = (resp.data as Array<{ id?: string }> | undefined) ?? [];
    const models = raw
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id))
      .map((id) => {
        const low = id.toLowerCase();
        const kind = NON_CHAT.some((h) => low.includes(h)) ? "media" : "chat";
        return { id, kind };
      })
      .sort(compareModels);
    return { models };
  });

const chatInput = creds.extend({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
    }),
  ),
});

export const chatCompletion = createServerFn({ method: "POST" })
  .validator(chatInput.parse)
  .handler(async ({ data }) => {
    const base = data.baseUrl.replace(/\/+$/, "");
    const resp = await httpJson(
      "POST",
      `${base}/chat/completions`,
      data.apiKey,
      {
        model: data.model,
        messages: data.messages,
        temperature: 0,
        max_tokens: 32768,
        max_completion_tokens: 32768,
        reasoning_effort: "xhigh",
        reasoning: { effort: "xhigh" },
      },
      180000,
    );
    const choice = ((resp.choices as Array<{ message?: Record<string, string> }>) ??
      [])[0];
    const msg = choice?.message ?? {};
    return {
      content: msg.content ?? "",
      reasoning: msg.reasoning_content ?? "",
      usage: (resp.usage as Record<string, number>) ?? {},
      model: (resp.model as string) ?? data.model,
    };
  });

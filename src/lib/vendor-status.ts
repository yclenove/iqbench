import { createServerFn } from "@tanstack/react-start";

export type VendorKind = "chat" | "cn" | "infer" | "media" | "cloud" | "tool";
export type VendorLevel = "ok" | "minor" | "major" | "maint" | "unknown";

export type VendorRow = {
  id: string;
  name: string;
  kind: VendorKind | string;
  page: string;
  blurb: string;
  level: VendorLevel;
  label: string;
  updated: string | null;
  logo?: string | null;
  uptimePct?: number | null;
  bars?: { level: VendorLevel; date: string }[];
};

type Hit = { level: VendorLevel; label: string; updated: string | null };

type VendorDef = {
  id: string;
  name: string;
  kind: VendorKind;
  page: string;
  blurb: string;
  how: "statuspage" | "instatus" | "deepinfra" | "betterstack" | "html" | "gcloud";
  api?: string;
};

const VENDORS: VendorDef[] = [
  { id: "openai", name: "OpenAI / ChatGPT", kind: "chat", page: "https://status.openai.com/", how: "statuspage", blurb: "GPT · ChatGPT · Codex · API" },
  { id: "anthropic", name: "Claude / Anthropic", kind: "chat", page: "https://status.claude.com/", how: "statuspage", blurb: "Claude 对话、API、Claude Code" },
  { id: "gemini", name: "Google Gemini", kind: "chat", page: "https://aistudio.google.com/status", how: "gcloud", api: "gemini|vertex|generative language|ai studio", blurb: "Gemini API · AI Studio" },
  { id: "xai", name: "xAI / Grok", kind: "chat", page: "https://status.x.ai/", how: "html", api: "https://status.x.ai/feed.xml", blurb: "Grok 对话与 Inference API" },
  { id: "mistral", name: "Mistral", kind: "chat", page: "https://status.mistral.ai/", how: "html", blurb: "Mistral Large / Codestral" },
  { id: "perplexity", name: "Perplexity", kind: "chat", page: "https://status.perplexity.com/", how: "instatus", blurb: "搜索对话与 API" },
  { id: "deepseek", name: "DeepSeek", kind: "cn", page: "https://status.deepseek.com/", how: "html", blurb: "对话与 V4 API" },
  { id: "moonshot", name: "Kimi / Moonshot", kind: "cn", page: "https://status.moonshot.cn/", how: "statuspage", blurb: "Kimi 长上下文" },
  { id: "minimax", name: "MiniMax", kind: "cn", page: "https://status.minimax.io/", how: "statuspage", blurb: "海螺与开放平台" },
  { id: "groq", name: "Groq", kind: "infer", page: "https://groqstatus.com/", how: "statuspage", blurb: "LPU 推理" },
  { id: "together", name: "Together", kind: "infer", page: "https://status.together.ai/", how: "betterstack", blurb: "开源模型推理云" },
  { id: "fireworks", name: "Fireworks", kind: "infer", page: "https://status.fireworks.ai/", how: "statuspage", blurb: "Fireworks 推理" },
  { id: "openrouter", name: "OpenRouter", kind: "infer", page: "https://status.openrouter.ai/", how: "html", blurb: "多模型聚合网关" },
  { id: "huggingface", name: "Hugging Face", kind: "infer", page: "https://status.huggingface.co/", how: "betterstack", blurb: "Hub 与 Inference" },
  { id: "cerebras", name: "Cerebras", kind: "infer", page: "https://status.cerebras.ai/", how: "statuspage", blurb: "晶圆级推理" },
  { id: "sambanova", name: "SambaNova", kind: "infer", page: "https://status.sambanova.ai/", how: "statuspage", blurb: "SambaCloud" },
  { id: "deepinfra", name: "DeepInfra", kind: "infer", page: "https://status.deepinfra.com/", how: "deepinfra", blurb: "开源模型托管" },
  { id: "novita", name: "Novita", kind: "infer", page: "https://status.novita.ai/", how: "betterstack", blurb: "GPU 与模型 API" },
  { id: "replicate", name: "Replicate", kind: "infer", page: "https://www.replicatestatus.com/", how: "statuspage", blurb: "模型运行时" },
  { id: "nebius", name: "Nebius", kind: "infer", page: "https://status.nebius.com/", how: "statuspage", blurb: "AI 云" },
  { id: "voyage", name: "Voyage", kind: "infer", page: "https://voyageai-status.statuspage.io/", how: "statuspage", blurb: "Embedding API" },
  { id: "cohere", name: "Cohere", kind: "infer", page: "https://status.cohere.com/", how: "statuspage", blurb: "Command 与 Embed" },
  { id: "fal", name: "fal.ai", kind: "media", page: "https://status.fal.ai/", how: "instatus", blurb: "图像 / 视频生成" },
  { id: "stability", name: "Stability", kind: "media", page: "https://status.stability.ai/", how: "statuspage", blurb: "Stable Diffusion 系" },
  { id: "elevenlabs", name: "ElevenLabs", kind: "media", page: "https://status.elevenlabs.io/", how: "statuspage", blurb: "语音合成" },
  { id: "google", name: "Google Cloud", kind: "cloud", page: "https://status.cloud.google.com/", how: "gcloud", blurb: "含 Vertex / 全球云" },
  { id: "cloudflare", name: "Cloudflare", kind: "cloud", page: "https://www.cloudflarestatus.com/", how: "statuspage", blurb: "CDN · Workers · DNS" },
  { id: "github", name: "GitHub", kind: "tool", page: "https://www.githubstatus.com/", how: "statuspage", blurb: "Git · Actions · Models" },
  { id: "cursor", name: "Cursor", kind: "tool", page: "https://status.cursor.com/", how: "statuspage", blurb: "编辑器与 Agent" },
];

export const STATUS_GROUPS: { id: VendorKind; title: string }[] = [
  { id: "chat", title: "对话大模型" },
  { id: "cn", title: "国产大模型" },
  { id: "infer", title: "模型平台与推理" },
  { id: "media", title: "生成式媒体" },
  { id: "cloud", title: "云与部署" },
  { id: "tool", title: "开发者工具" },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const g = globalThis as typeof globalThis & {
  __vendorStatusCache__?: { at: number; rows: VendorRow[] };
};

function mapIndicator(ind: string): { level: VendorLevel; label: string } {
  const s = ind.toLowerCase();
  if (s === "none" || s === "up" || s === "operational" || s === "ok") return { level: "ok", label: "正常" };
  if (s === "minor" || s === "degraded" || s === "hasissues" || s === "partial") return { level: "minor", label: "降级" };
  if (s === "major" || s === "critical" || s === "down" || s === "outage") return { level: "major", label: "故障" };
  if (s.includes("maint")) return { level: "maint", label: "维护" };
  return { level: "unknown", label: ind || "未知" };
}

function decodeChunks(parts: Uint8Array[]) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return new TextDecoder().decode(out);
}

async function pullOnce(url: string, timeout = 10000, max = 96_000): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "user-agent": UA,
      },
    });
    if (!res.body) return await res.text();
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    while (n < max) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.byteLength;
    }
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    return decodeChunks(parts);
  } finally {
    clearTimeout(t);
  }
}

function blocked(text: string) {
  return /Attention Required|Just a moment|cf-browser-verification|RouteNotFound/i.test(text);
}

async function pull(url: string): Promise<string> {
  const proxy = /status\.x\.ai|status\.deepseek\.com|aistudio\.google/.test(url);
  try {
    const text = await pullOnce(url);
    if (!blocked(text) && text.trim().length >= 8) return text;
    if (!proxy) throw new Error("blocked");
  } catch (e) {
    if (!proxy) throw e;
  }
  return pullOnce(`https://r.jina.ai/${url}`, 12000, 64_000);
}

function asJson(text: string): unknown {
  const s = text.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

function fromStatuspage(text: string): Hit | null {
  const j = asJson(text) as Record<string, unknown> | null;
  const st = j?.status as { indicator?: string; description?: string } | undefined;
  if (!st?.indicator && !st?.description) return null;
  const mapped = mapIndicator(String(st.indicator || ""));
  return {
    level: mapped.level,
    label: st.description || mapped.label,
    updated: String((j?.page as { updated_at?: string } | undefined)?.updated_at || "") || null,
  };
}

function fromInstatus(text: string): Hit | null {
  const j = asJson(text) as Record<string, unknown> | null;
  const page = j?.page as { status?: string } | undefined;
  if (!page?.status) return null;
  const mapped = mapIndicator(page.status);
  return { ...mapped, updated: null };
}

function fromDeepinfra(text: string): Hit | null {
  const j = asJson(text) as Record<string, unknown> | null;
  if (!j?.overallStatus) return null;
  const mapped = mapIndicator(String(j.overallStatus));
  return { ...mapped, updated: String(j.lastUpdatedAt || j.generatedAt || "") || null };
}

function fromBetterstack(html: string): Hit | null {
  if (/text-statuspage-red|og_downtime|og_major/i.test(html)) return { level: "major", label: "故障", updated: null };
  if (/text-statuspage-yellow|text-statuspage-orange|og_degraded/i.test(html)) return { level: "minor", label: "降级", updated: null };
  if (/text-statuspage-blue|og_maintenance/i.test(html)) return { level: "maint", label: "维护", updated: null };
  if (/text-statuspage-green|og_operational|All services are online/i.test(html)) {
    return { level: "ok", label: "正常", updated: null };
  }
  return fromHtml(html);
}

function fromHtml(html: string): Hit | null {
  const t = html.replace(/\s+/g, " ");
  if (
    /All systems operational|All Systems Operational|We're fully operational|fully operational|All services are online|No incidents declared|We're not aware of any issues|无未关闭|全部正常|运行正常/i.test(
      t,
    )
  ) {
    return { level: "ok", label: "正常", updated: null };
  }
  if (/Major (Service )?Outage|We're experiencing a major|严重故障|服务中断/i.test(t)) {
    return { level: "major", label: "故障", updated: null };
  }
  if (/Partial (Service )?Outage|Minor Service Outage|experiencing issues|Degraded performance|部分故障|降级/i.test(t)) {
    return { level: "minor", label: "降级", updated: null };
  }
  if (/under maintenance|scheduled maintenance/i.test(t)) {
    return { level: "maint", label: "维护", updated: null };
  }
  return null;
}

function fromGoogleIncidents(text: string, filter?: string): Hit | null {
  const data = asJson(text);
  if (!Array.isArray(data)) return null;
  const open = data.filter((i) => i && typeof i === "object" && !(i as { end?: string }).end);
  const keys = (filter || "")
    .split("|")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const hit = keys.length
    ? open.filter((i) => {
        const blob = JSON.stringify(i).toLowerCase();
        return keys.some((k) => blob.includes(k));
      })
    : open;
  if (!hit.length) return { level: "ok", label: keys.length ? "相关产品无事故" : "无未关闭事故", updated: null };
  return { level: "minor", label: `${hit.length} 条未关闭事故`, updated: null };
}

async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function probe(v: VendorDef): Promise<VendorRow> {
  const fail = (label = "拉不到"): VendorRow => ({
    id: v.id,
    name: v.name,
    kind: v.kind,
    page: v.page,
    blurb: v.blurb,
    level: "unknown",
    label,
    updated: null,
  });
  const ok = (hit: Hit): VendorRow => ({
    id: v.id,
    name: v.name,
    kind: v.kind,
    page: v.page,
    blurb: v.blurb,
    ...hit,
  });
  try {
    if (v.how === "statuspage") {
      const text = await pull(`${v.page.replace(/\/$/, "")}/api/v2/status.json`);
      const hit = fromStatuspage(text);
      return hit ? ok(hit) : fail("非 Statuspage");
    }
    if (v.how === "instatus") {
      const text = await pull(`${v.page.replace(/\/$/, "")}/summary.json`);
      const hit = fromInstatus(text);
      return hit ? ok(hit) : fail();
    }
    if (v.how === "deepinfra") {
      const text = await pull(`${v.page.replace(/\/$/, "")}/status.json`);
      const hit = fromDeepinfra(text);
      return hit ? ok(hit) : fail();
    }
    if (v.how === "gcloud") {
      const text = await pull("https://status.cloud.google.com/incidents.json");
      const hit = fromGoogleIncidents(text, v.api);
      return hit ? ok(hit) : fail();
    }
    if (v.how === "betterstack") {
      const text = await pull(`${v.page.replace(/\/$/, "")}/badge`);
      const hit = fromBetterstack(text);
      return hit ? ok(hit) : fail("badge 无状态");
    }
    const html = await pull(v.api || v.page);
    const hit = fromHtml(html) || fromBetterstack(html);
    return hit ? ok(hit) : fail("页面无状态摘要");
  } catch {
    return fail("超时或被拦");
  }
}

function barLevel(cls: string): VendorLevel {
  if (/\bmajor\b/.test(cls)) return "major";
  if (/\bdegraded\b|\bpartial\b/.test(cls)) return "minor";
  if (/\bmaintenance\b/.test(cls)) return "maint";
  if (/\boperational\b/.test(cls)) return "ok";
  return "unknown";
}

function cardLevel(cls: string): VendorLevel {
  if (/\bdegraded\b/.test(cls)) return "minor";
  if (/\bmajor\b/.test(cls)) return "major";
  if (/\bmaintenance\b/.test(cls)) return "maint";
  if (/\boperational\b/.test(cls)) return "ok";
  return "unknown";
}

function parseCleanip(html: string): VendorRow[] {
  const rows: VendorRow[] = [];
  const parts = html.split(/<h2 class="section-title[^"]*"/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const cat =
      chunk.match(/<span[^>]*>([^<]+)<\/span>\s*<\/h2>/)?.[1]?.trim() ||
      chunk.match(/>([^<]+)<\/h2>/)?.[1]?.trim();
    if (!cat) continue;
    const cards = chunk.split(/<div class="service-card /);
    for (let j = 1; j < cards.length; j++) {
      const c = cards[j];
      const cls = c.match(/^([^"]*)"/)?.[1] || "";
      const name = c.match(/<strong[^>]*>([^<]+)<\/strong>/)?.[1]?.trim();
      if (!name) continue;
      const logo = c.match(/<img src="([^"]+)"[^>]*class="service-favicon/)?.[1] || null;
      const blurb = c.match(/<span class="service-summary"[^>]*>([^<]*)</)?.[1]?.trim() || "";
      const pctRaw = c.match(/<span class="service-uptime"[^>]*>[\s\S]*?<strong[^>]*>([^<]+)</)?.[1];
      const uptimePct = pctRaw ? Number.parseFloat(pctRaw) : null;
      const page =
        c.match(/<a href="(https?:\/\/status\.[^"]+)"[^>]*class="uptime-strip/)?.[1] ||
        c.match(/<a href="(https?:\/\/[^"]+status[^"]*)"[^>]*class="uptime-strip/)?.[1] ||
        c.match(/href="(https?:\/\/[^"]+)"/)?.[1] ||
        "https://cleanip.io/status";
      const bars = [...c.matchAll(/<i class="uptime-bar ([^"]*)"[^>]*title="([^"]*)"/g)].map((m) => ({
        level: barLevel(m[1]),
        date: m[2].split(" · ")[0] || "",
      }));
      const level = cardLevel(cls);
      const id = (logo?.match(/\/([^/]+)\.svg/)?.[1] || name).toLowerCase().replace(/\s+/g, "-");
      rows.push({
        id,
        name,
        kind: cat,
        page,
        blurb,
        level,
        label: level === "ok" ? "正常" : level === "minor" ? "降级" : level === "major" ? "故障" : level === "maint" ? "维护" : "未知",
        updated: null,
        logo,
        uptimePct: Number.isFinite(uptimePct) ? uptimePct : null,
        bars,
      });
    }
  }
  return rows;
}

async function loadCleanip(): Promise<VendorRow[] | null> {
  const html = await pullOnce("https://cleanip.io/status", 15000, 2_000_000);
  const rows = parseCleanip(html);
  return rows.length >= 10 ? rows : null;
}

export const loadVendorStatus = createServerFn({ method: "GET" })
  .validator((d: { bust?: boolean } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const now = Date.now();
    if (!data.bust && g.__vendorStatusCache__ && now - g.__vendorStatusCache__.at < 45_000) {
      return { at: g.__vendorStatusCache__.at, rows: g.__vendorStatusCache__.rows, cached: true, source: "cache" as const };
    }
    try {
      const rows = await loadCleanip();
      if (rows) {
        g.__vendorStatusCache__ = { at: now, rows };
        return { at: now, rows, cached: false, source: "cleanip" as const };
      }
    } catch {
      /* fall through */
    }
    const rows = await mapPool(VENDORS, 6, probe);
    g.__vendorStatusCache__ = { at: now, rows };
    return { at: now, rows, cached: false, source: "direct" as const };
  });

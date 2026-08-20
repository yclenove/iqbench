export type StreamChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  signal?: AbortSignal;
  /** 硬顶。还在吐字就不会因这值被掐。默认 10 分钟。 */
  timeoutMs?: number;
  /** 连续无新字节才断。默认 50s。正文还没出现时用 thinkHoldMs。 */
  idleMs?: number;
  /** 只有思考、还没有正文时，允许多久不吐新字节。默认 180s。 */
  thinkHoldMs?: number;
  /** 最多尝试次数（含第一次）。默认 4；502/504 仍最多 2。 */
  retries?: number;
  maxTokens?: number;
  reasoningEffort?: string;
  /** auto：chat 404 再改 responses；chat / responses 强制单一协议。 */
  apiStyle?: "auto" | "chat" | "responses";
  onDelta?: (full: { content: string; reasoning: string }) => void;
  onRetry?: (attempt: number, max: number, reason: string) => void;
};

function takeDelta(obj: Record<string, unknown>) {
  const err = obj.error;
  if (typeof err === "string" && err.trim()) throw new Error(err.trim());
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; code?: unknown };
    const msg = typeof rec.message === "string" ? rec.message : JSON.stringify(err);
    throw new Error(msg);
  }
  const choices = obj.choices as Array<Record<string, unknown>> | undefined;
  const ch0 = choices?.[0] ?? {};
  const delta = (ch0.delta as Record<string, string> | undefined) ?? {};
  const message = (ch0.message as Record<string, string> | undefined) ?? {};
  return {
    content: delta.content || message.content || "",
    reasoning: delta.reasoning_content || message.reasoning_content || "",
    finish: String(ch0.finish_reason || obj.finish_reason || ""),
  };
}

function errText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isGateway(err: unknown) {
  return /HTTP 502|HTTP 503|HTTP 504|HTTP 524/.test(errText(err));
}

function isServerBlip(err: unknown) {
  const msg = errText(err);
  return /HTTP\s*5\d\d|\b50[0-4]\b|Internal Server Error|"error"\s*:\s*"?(?:HTTP\s*)?5\d\d|Bad Gateway|Service Unavailable|Gateway Timeout|cf-error/i.test(
    msg,
  );
}

export function isRetryable(err: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return false;
  const msg = errText(err);
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return true;
  }
  if (isServerBlip(err)) return true;
  if (/GoUsageLimitError|Monthly usage limit|usage limit reached/i.test(msg)) return false;
  return /HTTP 408|HTTP 429|upstream_saturated|并发上限|饱和|Failed to fetch|fetch failed|NetworkError|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|timeout|超时|网络|aborted|AbortError|空完成|无 output_text/i.test(
    msg,
  );
}

function retryWait(err: unknown, attempt: number) {
  const msg = errText(err);
  if (/HTTP 429/.test(msg)) return Math.min(16000, 2000 * 2 ** (attempt - 1));
  if (/upstream_saturated|并发上限|饱和/.test(msg)) return Math.min(12000, 2000 * 2 ** (attempt - 1));
  if (/\b500\b|Internal Server Error/.test(msg)) return Math.min(8000, 1000 * 2 ** (attempt - 1));
  if (isGateway(err)) return Math.min(2500, 800 * 2 ** (attempt - 1));
  return Math.min(2000, 400 * 2 ** (attempt - 1));
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function streamChatOnce(input: StreamChatInput) {
  const hardMs = input.timeoutMs ?? 600_000;
  const idleMs = input.idleMs ?? 50_000;
  const thinkHoldMs = input.thinkHoldMs ?? 180_000;
  const idleCtrl = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleFired = false;
  const acc = { content: "", reasoning: "" };
  const stillDraw = () => {
    const s = acc.content + acc.reasoning;
    return /<svg\b/i.test(s) && !/<\/svg>/i.test(s);
  };
  const mostlyThink = () =>
    !acc.content.trim() || (acc.reasoning.length > 80 && acc.content.trim().length < 80);
  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleFired = false;
    const wait = stillDraw() || mostlyThink() ? thinkHoldMs : idleMs;
    idleTimer = setTimeout(() => {
      idleFired = true;
      idleCtrl.abort();
    }, wait);
  };
  bumpIdle();
  const parts = [AbortSignal.timeout(hardMs), idleCtrl.signal];
  if (input.signal) parts.unshift(input.signal);
  const signal = AbortSignal.any(parts);
  try {
    const res = await fetch("/api/bench/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model,
        messages: input.messages,
        maxTokens: input.maxTokens,
        reasoningEffort: input.reasoningEffort,
        apiStyle: input.apiStyle,
      }),
      signal,
    });

    const ctype = res.headers.get("content-type") || "";
    if (!res.ok) {
      const err = await res.text();
      const slim = err.replace(/\s+/g, " ").slice(0, 300);
      throw new Error(`HTTP ${res.status}: ${slim || res.statusText}`);
    }

    if (ctype.includes("application/json") && !ctype.includes("event-stream")) {
      const body = (await res.json()) as Record<string, unknown>;
      if (body.error) throw new Error(String(body.error));
      const d = takeDelta(body);
      input.onDelta?.({ content: d.content, reasoning: d.reasoning });
      return { content: d.content, reasoning: d.reasoning, finish: d.finish };
    }

    if (!res.body) throw new Error("没有响应流");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finish = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        bumpIdle();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data) as Record<string, unknown>;
            const d = takeDelta(obj);
            if (d.content) acc.content += d.content;
            if (d.reasoning) acc.reasoning += d.reasoning;
            if (d.finish) finish = d.finish;
            if (d.content || d.reasoning) bumpIdle();
            input.onDelta?.({ content: acc.content, reasoning: acc.reasoning });
          } catch {
            /* keep-alive */
          }
        }
      }
    } catch (e) {
      if (acc.content || acc.reasoning) {
        const why = idleFired
          ? "idle"
          : e instanceof DOMException && e.name === "TimeoutError"
            ? "timeout"
            : finish || "error";
        return { content: acc.content, reasoning: acc.reasoning, finish: why };
      }
      throw e;
    }

    return { content: acc.content, reasoning: acc.reasoning, finish };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

export async function streamChat(input: StreamChatInput) {
  const max = Math.max(1, input.retries ?? 4);
  let lastErr: unknown = new Error("未知错误");
  for (let attempt = 1; attempt <= max; attempt++) {
    if (input.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await streamChatOnce(input);
    } catch (err) {
      lastErr = err;
      const msg = errText(err);
      const hardGateway = /HTTP 524|524:/.test(msg);
      const gatewayCap = hardGateway && attempt >= 2;
      const blipCap = isGateway(err) && !hardGateway && attempt >= 3;
      if (!isRetryable(err, input.signal) || attempt === max || gatewayCap || blipCap) throw err;
      const wait = retryWait(err, attempt);
      input.onRetry?.(attempt, hardGateway ? 2 : isGateway(err) ? 3 : max, `${errText(err)} · ${wait}ms 后`);
      await sleep(wait, input.signal);
    }
  }
  throw lastErr;
}

/** 非流式调用的通用重试（拉模型列表 / 云同步 / 对照拉取）。默认 3 次，0.8s/1.6s 退避 */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown = new Error("未知错误");
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === tries) break;
      await new Promise((r) => setTimeout(r, Math.min(4000, 800 * 2 ** (attempt - 1))));
    }
  }
  throw lastErr;
}
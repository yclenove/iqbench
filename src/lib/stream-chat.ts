export type StreamChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  signal?: AbortSignal;
  onDelta?: (full: { content: string; reasoning: string }) => void;
  onRetry?: (attempt: number, max: number, reason: string) => void;
};

function takeDelta(obj: Record<string, unknown>) {
  const choices = obj.choices as Array<Record<string, unknown>> | undefined;
  const ch0 = choices?.[0] ?? {};
  const delta = (ch0.delta as Record<string, string> | undefined) ?? {};
  const message = (ch0.message as Record<string, string> | undefined) ?? {};
  return {
    content: delta.content || message.content || "",
    reasoning: delta.reasoning_content || message.reasoning_content || "",
  };
}

function errText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function isRetryable(err: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return false;
  const msg = errText(err);
  if (err instanceof TypeError) return true;
  // 5xx 全类 + 408/429 + 常见网络层错误（含 Cloudflare 52x、DNS、断连）
  return /HTTP 408|HTTP 429|HTTP 5\d\d|upstream_saturated|并发上限|饱和|Failed to fetch|fetch failed|NetworkError|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|timeout|超时|网络/i.test(
    msg,
  );
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
  const res = await fetch("/api/bench/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      messages: input.messages,
    }),
    signal: input.signal,
  });

  const ctype = res.headers.get("content-type") || "";
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err.slice(0, 400) || `HTTP ${res.status}`);
  }

  if (ctype.includes("application/json") && !ctype.includes("event-stream")) {
    const body = (await res.json()) as Record<string, unknown>;
    if (body.error) throw new Error(String(body.error));
    const d = takeDelta(body);
    input.onDelta?.({ content: d.content, reasoning: d.reasoning });
    return { content: d.content, reasoning: d.reasoning };
  }

  if (!res.body) throw new Error("没有响应流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let reasoning = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
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
          if (d.content) content += d.content;
          if (d.reasoning) reasoning += d.reasoning;
          input.onDelta?.({ content, reasoning });
        } catch {
          /* keep-alive */
        }
      }
    }
  } catch (e) {
    if (content || reasoning) {
      return { content, reasoning };
    }
    throw e;
  }

  return { content, reasoning };
}

export async function streamChat(input: StreamChatInput) {
  const max = 4;
  let lastErr: unknown = new Error("未知错误");
  for (let attempt = 1; attempt <= max; attempt++) {
    if (input.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await streamChatOnce(input);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err, input.signal) || attempt === max) throw err;
      // 1s/2s/4s 退避，限流(429)再加倍
      let wait = Math.min(8000, 1000 * 2 ** (attempt - 1));
      if (/HTTP 429/.test(errText(err))) wait *= 2;
      if (/upstream_saturated|并发上限|饱和/.test(errText(err))) wait = Math.min(20000, 3000 * 2 ** (attempt - 1));
      input.onRetry?.(attempt, max, errText(err));
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

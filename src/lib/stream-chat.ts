export type StreamChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  signal?: AbortSignal;
  /** 单次请求超时，不含重试间隔。默认 90s。 */
  timeoutMs?: number;
  /** 最多尝试次数（含第一次）。默认 4；502/504 仍最多 2。 */
  retries?: number;
  maxTokens?: number;
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
    finish: String(ch0.finish_reason || obj.finish_reason || ""),
  };
}

function errText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isGateway(err: unknown) {
  return /HTTP 502|HTTP 503|HTTP 504|HTTP 524/.test(errText(err));
}

export function isRetryable(err: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return false;
  const msg = errText(err);
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return true;
  }
  return /HTTP 408|HTTP 429|HTTP 5\d\d|upstream_saturated|并发上限|饱和|Failed to fetch|fetch failed|NetworkError|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|timeout|超时|网络|aborted|AbortError/i.test(
    msg,
  );
}

function retryWait(err: unknown, attempt: number) {
  const msg = errText(err);
  if (/HTTP 429/.test(msg)) return Math.min(16000, 2000 * 2 ** (attempt - 1));
  if (/upstream_saturated|并发上限|饱和/.test(msg)) return Math.min(12000, 2000 * 2 ** (attempt - 1));
  if (isGateway(err)) return 400;
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
  const perTry = input.timeoutMs ?? 90_000;
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(perTry)])
    : AbortSignal.timeout(perTry);
  const res = await fetch("/api/bench/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      messages: input.messages,
      maxTokens: input.maxTokens,
    }),
    signal,
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
    return { content: d.content, reasoning: d.reasoning, finish: d.finish };
  }

  if (!res.body) throw new Error("没有响应流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let reasoning = "";
  let finish = "";

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
          if (d.finish) finish = d.finish;
          input.onDelta?.({ content, reasoning });
        } catch {
          /* keep-alive */
        }
      }
    }
  } catch (e) {
    if (content || reasoning) {
      return { content, reasoning, finish: finish || "error" };
    }
    throw e;
  }

  return { content, reasoning, finish };
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
      const gatewayCap = isGateway(err) && attempt >= 2;
      if (!isRetryable(err, input.signal) || attempt === max || gatewayCap) throw err;
      const wait = retryWait(err, attempt);
      input.onRetry?.(attempt, isGateway(err) ? 2 : max, `${errText(err)} · ${wait}ms 后`);
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
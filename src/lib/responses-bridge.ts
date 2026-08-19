/** OpenAI Responses / Codex 渠道：把 /responses SSE 转成 chat.completions 块，前端不用改。 */

export function looksResponsesOnly(status: number, msg: string) {
  return (
    status === 404 ||
    /no route available|not_found_error|unknown endpoint|\/responses|does not support chat\.completions/i.test(
      msg,
    )
  );
}

function asInputItems(messages: Array<{ role: string; content: string }>) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: "message",
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: m.content }],
    }));
}

export function responsesPayload(
  model: string,
  messages: Array<{ role: string; content: string }>,
  cap: number,
  extra: Record<string, unknown> = {},
) {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  return {
    model,
    stream: true,
    store: false,
    max_output_tokens: Math.min(32768, Math.max(256, cap)),
    instructions: sys || undefined,
    input: asInputItems(messages),
    ...extra,
  };
}

export function responsesPayloadVariants(
  model: string,
  messages: Array<{ role: string; content: string }>,
  cap: number,
  effort = "xhigh",
) {
  const rest = messages.filter((m) => m.role !== "system");
  const asString =
    rest.length === 1 && rest[0]?.role === "user" ? rest[0].content : rest.map((m) => ({ role: m.role, content: m.content }));
  const reason = effort && effort !== "none" ? { reasoning: { effort } } : {};
  return [
    responsesPayload(model, messages, cap, reason),
    responsesPayload(model, messages, cap, { ...reason, input: asString }),
  ];
}

function chatChunk(delta: { content?: string; reasoning_content?: string }, finish = "") {
  return `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: finish || null }],
  })}\n\n`;
}

function pieceOf(obj: Record<string, unknown>): string {
  if (typeof obj.delta === "string") return obj.delta;
  if (obj.delta && typeof obj.delta === "object") {
    const d = obj.delta as Record<string, unknown>;
    if (typeof d.text === "string") return d.text;
    if (typeof d.value === "string") return d.value;
    if (typeof d.content === "string") return d.content;
  }
  if (typeof obj.text === "string") return obj.text;
  const part = obj.part as Record<string, unknown> | undefined;
  if (part && typeof part.text === "string") return part.text;
  return "";
}

function fromOutput(output: unknown): { content: string; reasoning: string } {
  let content = "";
  let reasoning = "";
  if (!Array.isArray(output)) return { content, reasoning };
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const rec = item as {
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      summary?: Array<{ type?: string; text?: string }>;
    };
    for (const part of rec.content || []) {
      const t = part.text || "";
      if (!t) continue;
      if (part.type === "reasoning_text" || rec.type === "reasoning") reasoning += t;
      else content += t;
    }
    for (const part of rec.summary || []) {
      if (part.text) reasoning += part.text;
    }
  }
  return { content, reasoning };
}

function salvage(obj: Record<string, unknown>) {
  const resp = (obj.response && typeof obj.response === "object"
    ? obj.response
    : obj) as { output?: unknown; output_text?: unknown };
  const from = fromOutput(resp.output);
  if (typeof resp.output_text === "string" && resp.output_text) from.content = from.content || resp.output_text;
  return from;
}

function emitBlock(
  block: string,
  ctl: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  state: { content: string; reasoning: string },
) {
  const dataLines = block.split(/\n/).filter((l) => l.startsWith("data:"));
  const payloads = dataLines.length
    ? dataLines.map((l) => l.slice(5).trim())
    : /^\s*\{/.test(block)
      ? [block.trim()]
      : [];
  for (const raw of payloads) {
    if (!raw || raw === "[DONE]") continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = String(obj.type || "");
    const piece = pieceOf(obj);
    if (type.includes("reasoning") && piece) {
      state.reasoning += piece;
      ctl.enqueue(encoder.encode(chatChunk({ reasoning_content: piece })));
    } else if (
      (type === "response.output_text.delta" ||
        type === "response.output_text.done" ||
        type === "response.content_part.delta" ||
        type === "response.content_part.done") &&
      piece
    ) {
      state.content += piece;
      ctl.enqueue(encoder.encode(chatChunk({ content: piece })));
    } else if (type === "response.failed" || type === "error") {
      const err = obj.error;
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(obj).slice(0, 300);
      ctl.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
    } else if (type === "response.completed" || type === "response.incomplete") {
      const got = salvage(obj);
      if (got.content && !state.content) {
        state.content = got.content;
        ctl.enqueue(encoder.encode(chatChunk({ content: got.content })));
      }
      if (got.reasoning && !state.reasoning) {
        state.reasoning = got.reasoning;
        ctl.enqueue(encoder.encode(chatChunk({ reasoning_content: got.reasoning })));
      }
      if (!state.content && !state.reasoning) {
        ctl.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "responses 空完成（无 output_text）" })}\n\n`),
        );
      } else {
        ctl.enqueue(encoder.encode(chatChunk({}, type === "response.incomplete" ? "length" : "stop")));
        ctl.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
    }
  }
}

export function responsesSseToChat(upstream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  const state = { content: "", reasoning: "" };
  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        buf += decoder.decode(chunk, { stream: true });
        const parts = buf.split(/\n\n/);
        buf = parts.pop() ?? "";
        for (const block of parts) emitBlock(block, ctl, encoder, state);
      },
      flush(ctl) {
        if (buf.trim()) emitBlock(buf, ctl, encoder, state);
      },
    }),
  );
}

export function responsesJsonToChat(raw: string) {
  try {
    const obj = JSON.parse(raw) as {
      output?: unknown;
      output_text?: string;
      error?: { message?: string } | string;
    };
    if (obj.error) {
      const msg = typeof obj.error === "string" ? obj.error : obj.error.message;
      return { error: msg || "responses error" };
    }
    const { content, reasoning } = fromOutput(obj.output);
    const text = content || obj.output_text || "";
    if (!text && !reasoning) return { error: "responses 空完成（无 output_text）" };
    return {
      choices: [
        {
          message: { content: text, reasoning_content: reasoning },
          finish_reason: "stop",
        },
      ],
    };
  } catch {
    return { error: raw.slice(0, 300) };
  }
}

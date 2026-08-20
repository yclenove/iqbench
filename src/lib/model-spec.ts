import { isEffort, isEffortAlias, type Effort } from "./effort";

export type ModelSpec = {
  efforts: Effort[];
  context: number;
  output: number;
  reasoning: boolean;
};

export type SpecIndex = Record<string, ModelSpec>;

function keyOf(id: string) {
  return (id.split("/").pop() || id)
    .toLowerCase()
    .replace(/@(max|xhigh|high|medium|low|minimal|none)$/i, "");
}

function loose(id: string) {
  return keyOf(id).replace(/[._]/g, "-");
}

function asEffort(v: unknown): Effort | null {
  const s = String(v || "").toLowerCase();
  if (s === "mid") return "medium";
  return isEffort(s) ? s : null;
}

const ORDER: Effort[] = ["max", "xhigh", "high", "medium", "low", "minimal", "none"];

function voteEfforts(lists: Effort[][]): Effort[] {
  const nonempty = lists.filter((l) => l.length);
  if (!nonempty.length) return [];
  const n = nonempty.length;
  const count = new Map<Effort, number>();
  for (const list of nonempty) {
    for (const e of new Set(list)) count.set(e, (count.get(e) || 0) + 1);
  }
  const picked = ORDER.filter((e) => (count.get(e) || 0) * 2 >= n);
  return picked.length ? picked : nonempty.sort((a, b) => b.length - a.length)[0]!;
}

export function compactCatalog(raw: Record<string, { models?: Record<string, Record<string, unknown>> }>) {
  type Bag = { lists: Effort[][]; context: number; output: number; reasoning: boolean };
  const bags: Record<string, Bag> = {};
  const add = (k: string, spec: ModelSpec) => {
    if (!k) return;
    const b = bags[k] || { lists: [], context: 0, output: 0, reasoning: false };
    if (spec.efforts.length) b.lists.push(spec.efforts);
    b.context = Math.max(b.context, spec.context);
    b.output = Math.max(b.output, spec.output);
    b.reasoning = b.reasoning || spec.reasoning;
    bags[k] = b;
  };
  for (const p of Object.values(raw || {})) {
    const models = p?.models || {};
    for (const [mid, m] of Object.entries(models)) {
      if (!m || typeof m !== "object") continue;
      const efforts: Effort[] = [];
      const opts = Array.isArray(m.reasoning_options) ? m.reasoning_options : [];
      let toggle = false;
      for (const o of opts) {
        if (!o || typeof o !== "object") continue;
        const rec = o as { type?: string; values?: unknown[] };
        if (rec.type === "toggle") toggle = true;
        for (const v of rec.values || []) {
          const e = asEffort(v);
          if (e && !efforts.includes(e)) efforts.push(e);
        }
      }
      const reasoning = Boolean(m.reasoning);
      if (toggle && !efforts.length) efforts.push("none", "high");
      const limit = (m.limit || {}) as { context?: number; output?: number };
      const spec: ModelSpec = {
        reasoning,
        efforts,
        context: Number(limit.context) || 0,
        output: Number(limit.output) || 0,
      };
      const id = String(m.id || mid);
      for (const k of new Set([keyOf(id), keyOf(mid), loose(id), loose(mid)])) add(k, spec);
    }
  }
  const idx: SpecIndex = {};
  for (const [k, b] of Object.entries(bags)) {
    idx[k] = {
      efforts: voteEfforts(b.lists),
      context: b.context,
      output: b.output,
      reasoning: b.reasoning,
    };
  }
  return idx;
}

export function lookupSpec(idx: SpecIndex | null | undefined, model: string): ModelSpec | undefined {
  if (!idx) return undefined;
  const k = keyOf(model);
  const L = loose(model);
  if (idx[k]) return idx[k];
  if (idx[L]) return idx[L];
  const stripped = k.replace(/[-_.](max|xhigh|high|medium|mid|low|minimal|none|fast|think)$/i, "");
  if (stripped !== k && idx[stripped]) return idx[stripped];
  const looseStrip = loose(stripped);
  if (idx[looseStrip]) return idx[looseStrip];
  const hits = Object.keys(idx).filter((id) => id === k || id.endsWith(`-${k}`) || id.endsWith(`/${k}`));
  if (hits.length === 1) return idx[hits[0]];
  return undefined;
}

export function highestEffortFor(idx: SpecIndex | null | undefined, model: string): Effort {
  if (isEffortAlias(model)) return "none";
  const spec = lookupSpec(idx, model);
  if (spec?.efforts?.length) return spec.efforts[0];
  if (spec && !spec.reasoning) return "none";
  return "xhigh";
}

export function specEffortsFor(idx: SpecIndex | null | undefined, model: string): Effort[] {
  if (isEffortAlias(model)) return ["none"];
  const spec = lookupSpec(idx, model);
  if (spec?.efforts?.length) return spec.efforts;
  if (spec && !spec.reasoning) return ["none"];
  return ["xhigh"];
}

export function specSummary(idx: SpecIndex | null | undefined, model: string) {
  const spec = lookupSpec(idx, model);
  if (!spec) return "规格未匹配，输出按 128k、思考 xhigh";
  const fmt = (n: number) => {
    if (!n) return "?";
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  };
  const hi = spec.efforts[0] || (spec.reasoning ? "xhigh" : "none");
  return `ctx ${fmt(spec.context)} · out ${fmt(spec.output)} · 最高 ${hi}`;
}

export function outputCap(idx: SpecIndex | null | undefined, model: string) {
  const spec = lookupSpec(idx, model);
  const n = spec?.output || 0;
  if (n >= 1024) return Math.min(262144, Math.max(4096, n));
  return 131072;
}

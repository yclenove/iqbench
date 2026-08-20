import { QUESTIONS, MAX_SCORE, UNITS, modelIq } from "./questions";
import type { ProbeProgress, ProbeResult } from "./probes";
import type { SvgCraft } from "./svg-craft";

export const BENCH_VER = 7;
const LS_RUNS = "iqbench_runs_v7";
const MAX_RUNS = 80;

export type ItemSnap = {
  ok: boolean;
  score: number;
  accuracy: number;
  speedFactor: number;
  seconds: number;
  detail: string;
  memorized21?: boolean;
  tags?: string[];
  svg?: string;
  html?: string;
  craft?: SvgCraft;
  /** 模型正文摘录，方便逐题复盘空答/截断 */
  preview?: string;
  /** 本题过程：finish、思考字数、压缩重试 */
  trace?: string;
};

export type ModelSnap = {
  id: string;
  total: number;
  max: number;
  seconds: number;
  iq?: number;
  items: Record<string, ItemSnap>;
  /** 渠道鉴定（不计分），bench v7 起可选携带 */
  probe?: ProbeResult;
  /** 鉴定做到一半，续测从这里接着问 */
  probeProgress?: ProbeProgress;
  /** 全网降智对照（不计分），跑分当时的快照 */
  baseline?: Baseline;
};

export type Baseline = {
  runs: number;
  medIq: number;
  p25Iq: number;
  /** 本次 IQ 与全网中位的差 */
  delta: number;
  suspect: boolean;
};

export function baselineVerdict(
  iq: number,
  row: { runs: number; med_iq: number; p25_iq: number },
): Baseline {
  const delta = iq - row.med_iq;
  // 宁缺毋滥：样本 ≥5 次、低于中位 12 分、且不高于下四分位，才指认降智
  const suspect = row.runs >= 5 && delta <= -12 && iq <= row.p25_iq;
  return { runs: row.runs, medIq: row.med_iq, p25Iq: row.p25_iq, delta, suspect };
}

export function baselineLine(iq: number, b: Baseline) {
  const sign = b.delta >= 0 ? "+" : "";
  return `全网 ${b.runs} 次中位 IQ ${b.medIq}，本次 ${iq}（${sign}${b.delta}）${
    b.suspect ? " → 疑似降智渠道" : ""
  }`;
}

/** 各维度卷面得分，写入公开榜供维度榜聚合。 */
export function dimBreakdown(items: Record<string, ItemSnap | undefined>) {
  const out: Record<string, { s: number; m: number }> = {};
  for (const u of UNITS) {
    const rec = out[u.dim] ?? (out[u.dim] = { s: 0, m: 0 });
    rec.m += u.score;
    rec.s += items[u.id]?.score ?? 0;
  }
  return out;
}

export type BenchRun = {
  id: string;
  createdAt: string;
  host: string;
  hostPublic?: boolean;
  keyFp: string;
  keyHint: string;
  benchVer: number;
  maxScore: number;
  models: ModelSnap[];
  /** 登录用户展示名，画廊/榜用。游客不写。 */
  rider?: string;
};

export function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host || baseUrl || "unknown";
  } catch {
    return baseUrl || "unknown";
  }
}

const LS_HOST_PUB = "iqbench_host_pub";

export function maskHost(host: string) {
  const parts = (host || "").split(".").filter(Boolean);
  if (parts.length < 2) return "***";
  if (parts.length === 2) return `${parts[0].slice(0, 2)}***.${parts[1]}`;
  return `${parts[0]}.***.${parts[parts.length - 1]}`;
}

export function publishHost(host: string, hostPublic: boolean) {
  if (!host) return "";
  return hostPublic ? host : maskHost(host);
}

export function displayHost(host: string, hostPublic?: boolean) {
  if (!host) return "";
  if (host.includes("***")) return host;
  if (hostPublic === true) return host;
  return maskHost(host);
}

export function loadHostPublic(host: string) {
  if (!host) return false;
  try {
    const map = JSON.parse(localStorage.getItem(LS_HOST_PUB) || "{}") as Record<string, boolean>;
    if (Object.prototype.hasOwnProperty.call(map, host)) return Boolean(map[host]);
  } catch {
    /* ignore */
  }
  return false;
}

export function saveHostPublicPref(host: string, on: boolean) {
  if (!host) return;
  try {
    const map = JSON.parse(localStorage.getItem(LS_HOST_PUB) || "{}") as Record<string, boolean>;
    map[host] = on;
    localStorage.setItem(LS_HOST_PUB, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function keyFp(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function keyHint(key: string) {
  const t = key.trim();
  if (!t) return "未填";
  return t.length < 4 ? "尾号 ••••" : `尾号 ${t.slice(-4)}`;
}

export function scopeId(baseUrl: string, key: string) {
  return `${hostOf(baseUrl)}|${keyFp(key)}`;
}

export function wipeLegacy() {
  try {
    localStorage.removeItem("iqbench_runs_v1");
    const raw = localStorage.getItem("iqbench_cfg");
    if (raw) {
      const c = JSON.parse(raw) as Record<string, unknown>;
      delete c.key;
      localStorage.setItem("iqbench_cfg", JSON.stringify(c));
    }
  } catch {
    /* ignore */
  }
}

export function compactResults(
  results: Record<
    string,
    {
      total: number;
      max: number;
      seconds: number;
      items: Record<
        string,
        {
          ok: boolean;
          score: number;
          accuracy?: number;
          speedFactor?: number;
          seconds: number;
          detail: string;
          memorized21?: boolean;
          tags?: string[];
          svg?: string;
          html?: string;
          craft?: SvgCraft;
          preview?: string;
          trace?: string;
        }
      >;
      probe?: ProbeResult;
      probeProgress?: ProbeProgress;
      baseline?: Baseline;
    }
  >,
): ModelSnap[] {
  return Object.entries(results).map(([id, r]) => ({
    id,
    total: r.total,
    max: r.max,
    seconds: r.seconds,
    iq: modelIq(r.items).iq,
    probe: r.probe,
    probeProgress: r.probeProgress,
    baseline: r.baseline,
    items: Object.fromEntries(
      Object.entries(r.items).map(([qid, it]) => [
        qid,
        {
          ok: it.ok,
          score: it.score,
          accuracy: it.accuracy ?? it.score,
          speedFactor: it.speedFactor ?? 1,
          memorized21: Boolean(it.memorized21),
          tags: it.tags,
          seconds: it.seconds,
          detail: (it.detail || "").slice(0, 240),
          preview: (it.preview || "").slice(0, 2500) || undefined,
          trace: (it.trace || "").slice(0, 1200) || undefined,
          svg: (it.svg || "").slice(0, 80000) || undefined,
          html: (it.html || "").slice(0, 80000) || undefined,
          craft: it.craft,
        },
      ]),
    ),
  }));
}

export function makeRun(
  baseUrl: string,
  key: string,
  results: Parameters<typeof compactResults>[0],
  opts?: { hostPublic?: boolean; id?: string; rider?: string },
): BenchRun {
  const raw = hostOf(baseUrl);
  const hostPublic = Boolean(opts?.hostPublic);
  return {
    id: opts?.id || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    host: publishHost(raw, hostPublic),
    hostPublic,
    keyFp: keyFp(key),
    keyHint: keyHint(key),
    benchVer: BENCH_VER,
    maxScore: MAX_SCORE,
    models: compactResults(results),
    rider: opts?.rider?.trim() || undefined,
  };
}

export function loadRuns(): BenchRun[] {
  try {
    const raw = localStorage.getItem(LS_RUNS);
    const list = raw ? (JSON.parse(raw) as BenchRun[]) : [];
    return Array.isArray(list) ? list.filter((r) => r.benchVer === BENCH_VER) : [];
  } catch {
    return [];
  }
}

export function recomputeLocalIqs() {
  const next = loadRuns().map((r) => ({
    ...r,
    models: r.models.map((m) => ({ ...m, iq: modelIq(m.items || {}).iq })),
  }));
  try {
    localStorage.setItem(LS_RUNS, JSON.stringify(next.slice(0, MAX_RUNS)));
  } catch {
    /* ignore */
  }
  return next;
}

export function saveRun(run: BenchRun) {
  if (!run.models.length || run.benchVer !== BENCH_VER) return;
  const prev = loadRuns().filter((r) => r.id !== run.id);
  localStorage.setItem(LS_RUNS, JSON.stringify([run, ...prev].slice(0, MAX_RUNS)));
}

export function deleteRun(id: string) {
  try {
    const next = loadRuns().filter((r) => r.id !== id);
    localStorage.setItem(LS_RUNS, JSON.stringify(next));
    return next;
  } catch {
    return loadRuns();
  }
}

export function clearAllRuns() {
  try {
    localStorage.removeItem(LS_RUNS);
    localStorage.removeItem("iqbench_runs_v6");
    localStorage.removeItem("iqbench_runs_v5");
    localStorage.removeItem("iqbench_runs_v4");
    localStorage.removeItem("iqbench_runs_v1");
  } catch {
    /* ignore */
  }
}

export type BoardRow = {
  model: string;
  best: number;
  max: number;
  pct: number;
  iq: number;
  lastIq: number;
  bestSeconds: number;
  runs: number;
  lastAt: string;
  host: string;
  /** 见过的最新知识季度（字典序 max 即时间上最新） */
  freshness: string | null;
};

export function modelBoard(runs: BenchRun[]): BoardRow[] {
  const map = new Map<string, BoardRow>();
  for (const run of runs) {
    if (run.benchVer !== BENCH_VER) continue;
    for (const m of run.models) {
      const iq = m.iq ?? modelIq(m.items).iq;
      const cur = map.get(m.id);
      const row: BoardRow = cur ?? {
        model: m.id,
        best: m.total,
        max: m.max,
        pct: m.max ? Math.round((100 * m.total) / m.max) : 0,
        iq,
        lastIq: iq,
        bestSeconds: m.seconds,
        runs: 0,
        lastAt: run.createdAt,
        host: run.host,
        freshness: null,
      };
      row.runs += 1;
      const fresh = m.probe?.freshness;
      if (fresh && (!row.freshness || fresh > row.freshness)) row.freshness = fresh;
      if (iq > row.iq || (iq === row.iq && m.seconds < row.bestSeconds)) {
        row.best = m.total;
        row.max = m.max;
        row.pct = m.max ? Math.round((100 * m.total) / m.max) : 0;
        row.iq = iq;
        row.bestSeconds = m.seconds;
        row.host = run.host;
      }
      if (run.createdAt >= row.lastAt) {
        row.lastAt = run.createdAt;
        row.lastIq = iq;
      }
      map.set(m.id, row);
    }
  }
  return [...map.values()].sort((a, b) => b.iq - a.iq || a.bestSeconds - b.bestSeconds);
}

export type ChannelRow = {
  host: string;
  runs: number;
  models: number;
  avgIq: number;
  bestIq: number;
  topModel: string;
  webSuspect: boolean;
  juiceSeen: boolean;
  iqSuspect: boolean;
};

export function channelBoard(runs: BenchRun[]): ChannelRow[] {
  const map = new Map<
    string,
    {
      runs: number;
      models: Set<string>;
      iqs: number[];
      bestIq: number;
      top: string;
      web: boolean;
      juice: boolean;
      dumb: boolean;
    }
  >();
  for (const run of runs) {
    if (run.benchVer !== BENCH_VER) continue;
    const host = displayHost(run.host, run.hostPublic);
    const rec = map.get(host) ?? {
      runs: 0,
      models: new Set<string>(),
      iqs: [] as number[],
      bestIq: 0,
      top: "—",
      web: false,
      juice: false,
      dumb: false,
    };
    rec.runs += 1;
    for (const m of run.models) {
      const iq = m.iq ?? modelIq(m.items).iq;
      rec.models.add(m.id);
      rec.iqs.push(iq);
      if (iq > rec.bestIq) {
        rec.bestIq = iq;
        rec.top = m.id;
      }
      if (m.probe?.webSuspect) rec.web = true;
      if (m.probe?.juice.value != null) rec.juice = true;
      if (m.baseline?.suspect) rec.dumb = true;
    }
    map.set(host, rec);
  }
  return [...map.entries()]
    .map(([host, r]) => ({
      host,
      runs: r.runs,
      models: r.models.size,
      avgIq: r.iqs.length ? Math.round(r.iqs.reduce((s, n) => s + n, 0) / r.iqs.length) : 70,
      bestIq: r.bestIq,
      topModel: r.top,
      webSuspect: r.web,
      juiceSeen: r.juice,
      iqSuspect: r.dumb,
    }))
    .sort((a, b) => b.avgIq - a.avgIq || b.bestIq - a.bestIq);
}

export function runLabel(run: BenchRun) {
  const when = new Date(run.createdAt).toLocaleString("zh-CN", { hour12: false });
  const top = [...run.models].sort((a, b) => (b.iq ?? 0) - (a.iq ?? 0) || b.total - a.total)[0];
  return {
    when,
    n: run.models.length,
    topName: top?.id ?? "—",
    topScore: top ? `IQ ${top.iq ?? "—"} · ${top.total}/${top.max}` : "—",
  };
}

export { QUESTIONS };

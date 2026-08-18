import { QUESTIONS, MAX_SCORE, modelIq } from "./questions";

export const BENCH_VER = 6;
const LS_RUNS = "iqbench_runs_v6";
const MAX_RUNS = 80;

export type ItemSnap = {
  ok: boolean;
  score: number;
  accuracy: number;
  speedFactor: number;
  seconds: number;
  detail: string;
  memorized21?: boolean;
  svg?: string;
  html?: string;
};

export type ModelSnap = {
  id: string;
  total: number;
  max: number;
  seconds: number;
  iq?: number;
  items: Record<string, ItemSnap>;
};

export type BenchRun = {
  id: string;
  createdAt: string;
  host: string;
  keyFp: string;
  keyHint: string;
  benchVer: number;
  maxScore: number;
  models: ModelSnap[];
};

export function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host || baseUrl || "unknown";
  } catch {
    return baseUrl || "unknown";
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
      const c = JSON.parse(raw) as { base?: string; key?: string };
      localStorage.setItem("iqbench_cfg", JSON.stringify({ base: c.base || "" }));
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
          svg?: string;
          html?: string;
        }
      >;
    }
  >,
): ModelSnap[] {
  return Object.entries(results).map(([id, r]) => ({
    id,
    total: r.total,
    max: r.max,
    seconds: r.seconds,
    iq: modelIq(r.items).iq,
    items: Object.fromEntries(
      Object.entries(r.items).map(([qid, it]) => [
        qid,
        {
          ok: it.ok,
          score: it.score,
          accuracy: it.accuracy ?? it.score,
          speedFactor: it.speedFactor ?? 1,
          memorized21: Boolean(it.memorized21),
          seconds: it.seconds,
          detail: (it.detail || "").slice(0, 240),
          svg: (it.svg || "").slice(0, 80000) || undefined,
          html: (it.html || "").slice(0, 80000) || undefined,
        },
      ]),
    ),
  }));
}

export function makeRun(
  baseUrl: string,
  key: string,
  results: Parameters<typeof compactResults>[0],
): BenchRun {
  return {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    host: hostOf(baseUrl),
    keyFp: keyFp(key),
    keyHint: keyHint(key),
    benchVer: BENCH_VER,
    maxScore: MAX_SCORE,
    models: compactResults(results),
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
    localStorage.removeItem("iqbench_runs_v5");
    localStorage.removeItem("iqbench_runs_v1");
    localStorage.removeItem("iqbench_runs_v4");
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
  bestSeconds: number;
  runs: number;
  lastAt: string;
  host: string;
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
        best: -1,
        max: m.max,
        pct: 0,
        iq: 70,
        bestSeconds: m.seconds,
        runs: 0,
        lastAt: run.createdAt,
        host: run.host,
      };
      row.runs += 1;
      if (iq > row.iq || (iq === row.iq && m.seconds < row.bestSeconds)) {
        row.best = m.total;
        row.max = m.max;
        row.pct = m.max ? Math.round((100 * m.total) / m.max) : 0;
        row.iq = iq;
        row.bestSeconds = m.seconds;
        row.host = run.host;
      }
      if (run.createdAt > row.lastAt) row.lastAt = run.createdAt;
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
};

export function channelBoard(runs: BenchRun[]): ChannelRow[] {
  const map = new Map<
    string,
    { runs: number; models: Set<string>; iqs: number[]; bestIq: number; top: string }
  >();
  for (const run of runs) {
    if (run.benchVer !== BENCH_VER) continue;
    const rec = map.get(run.host) ?? {
      runs: 0,
      models: new Set<string>(),
      iqs: [] as number[],
      bestIq: 0,
      top: "—",
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
    }
    map.set(run.host, rec);
  }
  return [...map.entries()]
    .map(([host, r]) => ({
      host,
      runs: r.runs,
      models: r.models.size,
      avgIq: r.iqs.length ? Math.round(r.iqs.reduce((s, n) => s + n, 0) / r.iqs.length) : 70,
      bestIq: r.bestIq,
      topModel: r.top,
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

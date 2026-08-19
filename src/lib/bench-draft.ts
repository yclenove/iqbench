import { BENCH_VER, compactResults, type BenchRun, type ModelSnap } from "./bench-store";
import { QUESTIONS } from "./questions";

const LS_DRAFT = "iqbench_draft_v7";

export type BenchDraft = {
  id: string;
  benchVer: number;
  createdAt: string;
  updatedAt: string;
  host: string;
  keyFp: string;
  workers: number;
  probeOn: boolean;
  hostPublic: boolean;
  models: string[];
  results: ModelSnap[];
};

export type Job = { model: string; qid: string };

export function parentQid(id: string) {
  if (id === "Q16a" || id === "Q16b") return "Q16";
  return id;
}

export function emptyFailTag(preview: string) {
  const p = preview || "";
  if (/已停止|AbortError/.test(p)) return "已停止";
  const http =
    p.match(/HTTP\s*([1-5]\d\d)/i) ||
    p.match(/"error"\s*:\s*"(?:HTTP\s*)?([1-5]\d\d)/i) ||
    p.match(/\b(50[0-4])\s*:\s*Internal Server Error/i);
  if (http) return `HTTP ${http[1]}`;
  if (/Internal Server Error/i.test(p)) return "HTTP 500";
  if (/Failed to fetch|fetch failed|NetworkError|ECONN|ETIMEDOUT|饱和|upstream/i.test(p)) return "网络失败";
  if (/超时|timeout/i.test(p)) return "超时";
  if (/截断|思考未完成/.test(p)) return "截断";
  if (!p.trim()) return "空答";
  return "无产出";
}

export function isRetryableFail(it: {
  ok: boolean;
  detail?: string;
  preview?: string;
  tags?: string[];
}) {
  if (it.ok) return false;
  const blob = `${it.detail || ""} ${it.preview || ""} ${(it.tags || []).join(" ")}`;
  return /超预算无产出|无产出|空答|已停止|截断|思考未完成|HTTP\s*[1-5]\d\d|\b50[0-4]\b|Internal Server Error|Failed to fetch|fetch failed|超时|网络失败|网络|饱和|upstream|rate limit|Abort|网关|ECONN|ETIMEDOUT/i.test(
    blob,
  );
}

export function missingJobs(
  results: Record<string, { items: Record<string, unknown> | undefined } | undefined>,
  models: string[],
): Job[] {
  const jobs: Job[] = [];
  for (const model of models) {
    const items = results[model]?.items || {};
    for (const q of QUESTIONS.items) {
      if (q.id === "Q16") {
        if (!items.Q16a || !items.Q16b) jobs.push({ model, qid: "Q16" });
      } else if (!items[q.id]) {
        jobs.push({ model, qid: q.id });
      }
    }
  }
  return jobs;
}

export function retryableJobs(
  results: Record<
    string,
    { items: Record<string, { ok: boolean; detail?: string; preview?: string; tags?: string[] }> }
  >,
  models: string[],
): Job[] {
  const jobs: Job[] = [];
  for (const model of models) {
    const items = results[model]?.items || {};
    const seen = new Set<string>();
    for (const [id, it] of Object.entries(items)) {
      const qid = parentQid(id);
      if (seen.has(qid) || !it) continue;
      if (isRetryableFail(it)) {
        seen.add(qid);
        jobs.push({ model, qid });
      }
    }
  }
  return jobs;
}

export function draftSummary(d: BenchDraft) {
  const mapped: Record<string, { items: Record<string, { ok: boolean; detail?: string }> }> = {};
  for (const m of d.results) mapped[m.id] = { items: m.items };
  return {
    miss: missingJobs(mapped, d.models).length,
    retry: retryableJobs(mapped, d.models).length,
    n: d.models.length,
  };
}

export function loadDraft(): BenchDraft | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (!raw) return null;
    const d = JSON.parse(raw) as BenchDraft;
    if (!d || d.benchVer !== BENCH_VER || !d.models?.length) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(d: BenchDraft) {
  try {
    localStorage.setItem(
      LS_DRAFT,
      JSON.stringify({ ...d, benchVer: BENCH_VER, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* quota */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(LS_DRAFT);
  } catch {
    /* ignore */
  }
}

export function writeDraft(
  partial: Omit<BenchDraft, "results" | "updatedAt" | "benchVer"> & {
    results: Parameters<typeof compactResults>[0];
  },
) {
  saveDraft({
    ...partial,
    benchVer: BENCH_VER,
    updatedAt: new Date().toISOString(),
    results: compactResults(partial.results),
  });
}

export function runGaps(run: BenchRun) {
  const mapped: Record<string, { items: Record<string, { ok: boolean; detail?: string }> }> = {};
  for (const m of run.models) mapped[m.id] = { items: m.items };
  const models = run.models.map((m) => m.id);
  return {
    miss: missingJobs(mapped, models),
    retry: retryableJobs(mapped, models),
  };
}

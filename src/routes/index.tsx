import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Play,
  Square,
  ListChecks,
  X,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { MAX_SCORE, QUESTIONS, UNITS, bootstrapIq, instantiateQuestion, modelIq } from "@/lib/questions";
import { extractHtml, extractSvg, gallerySrcDoc, judgeItem } from "@/lib/judge";
import { listModels } from "@/lib/proxy";
import { streamChat } from "@/lib/stream-chat";
import { buildReportHtml, downloadReport } from "@/lib/report";
import {
  hostOf,
  keyFp,
  keyHint,
  makeRun,
  saveRun,
  wipeLegacy,
  type BenchRun,
} from "@/lib/bench-store";
import { listCloudRuns, saveCloudRun } from "@/lib/bench-db";
import { BenchArchive } from "@/components/bench-archive";

export const Route = createFileRoute("/")({ component: Home });

type ModelOpt = { id: string; kind: string };
type ItemResult = {
  ok: boolean;
  score: number;
  accuracy: number;
  speedFactor: number;
  detail: string;
  seconds: number;
  preview: string;
  memorized21?: boolean;
  tags?: string[];
  svg?: string;
  html?: string;
};
type ModelResult = {
  items: Record<string, ItemResult>;
  total: number;
  max: number;
  seconds: number;
  iq: number;
  iqLo?: number;
  iqHi?: number;
  equalRate?: number;
};

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-9 w-20 animate-pulse rounded-lg bg-surface-2" />;
  }
  return user ? (
    <UserButton />
  ) : (
    <Link
      to="/login"
      className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-fg"
    >
      登录
    </Link>
  );
}

function Home() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [workers, setWorkers] = useState(3);
  const [models, setModels] = useState<ModelOpt[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("就绪");
  const [log, setLog] = useState("");
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [results, setResults] = useState<Record<string, ModelResult>>({});
  const [liveJobs, setLiveJobs] = useState<Record<string, string>>({});
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [histTick, setHistTick] = useState(0);
  const [viewing, setViewing] = useState<BenchRun | null>(null);
  const logEl = useRef<HTMLPreElement>(null);
  const { user } = useCurrentUserState();
  const cfgReady = useRef(false);
  const prevScope = useRef("");

  useEffect(() => {
    wipeLegacy();
    try {
      const c = JSON.parse(localStorage.getItem("iqbench_cfg") || "{}") as {
        base?: string;
        workers?: number;
      };
      if (c.base) setBaseUrl(c.base);
      if (c.workers) setWorkers(Math.min(4, Math.max(1, c.workers)));
      const sessionKey = sessionStorage.getItem("iqbench_key");
      if (sessionKey) {
        setApiKey(sessionKey);
        setRememberKey(true);
      }
    } catch {
      /* ignore */
    }
    cfgReady.current = true;
  }, []);

  useEffect(() => {
    if (!cfgReady.current) return;
    const scope = `${hostOf(baseUrl)}|${keyFp(apiKey)}`;
    if (!prevScope.current) {
      prevScope.current = scope;
      return;
    }
    if (prevScope.current === scope) return;
    prevScope.current = scope;
    setResults({});
    setModels([]);
    setPicked({});
    setLog("");
    setLiveJobs({});
    setViewing(null);
    setStatus("已切换钥匙，本场成绩已清空");
  }, [baseUrl, apiKey]);

  useEffect(() => {
    if (!user) return;
    listCloudRuns()
      .then((cloud) => {
        cloud.forEach((r) => {
          if (r?.id && r.models) saveRun(r);
        });
        setHistTick((n) => n + 1);
      })
      .catch(() => {
        /* 未登录 */
      });
  }, [user]);

  useEffect(() => {
    if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight;
  }, [log]);

  const append = (line: string) => setLog((s) => s + line + "\n");

  const saveCfg = () => {
    localStorage.setItem("iqbench_cfg", JSON.stringify({ base: baseUrl, workers }));
    if (rememberKey && apiKey) sessionStorage.setItem("iqbench_key", apiKey);
    else sessionStorage.removeItem("iqbench_key");
  };

  const selected = models.filter((m) => picked[m.id]).map((m) => m.id);

  async function fetchModels() {
    saveCfg();
    setStatus("拉取模型中…");
    try {
      const data = await listModels({
        data: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() },
      });
      setModels(data.models);
      const next: Record<string, boolean> = {};
      data.models.forEach((m) => {
        next[m.id] = m.kind === "chat";
      });
      setPicked(next);
      append(`拉到 ${data.models.length} 个模型`);
      setStatus("模型已加载");
    } catch (e) {
      append("模型列表失败: " + (e instanceof Error ? e.message : String(e)));
      setStatus("失败");
    }
  }

  function selectChat() {
    const next: Record<string, boolean> = {};
    models.forEach((m) => {
      next[m.id] = m.kind !== "media";
    });
    setPicked(next);
  }

  async function run() {
    if (!selected.length) {
      append("先拉模型并至少选一个");
      return;
    }
    saveCfg();
    stopRef.current = false;
    setViewing(null);
    setRunning(true);
    setStatus(`测评中 · ${workers} 路并行`);
    setLiveJobs({});
    const nextResults: Record<string, ModelResult> = {};
    for (const model of selected) {
      nextResults[model] = { items: {}, total: 0, max: MAX_SCORE, seconds: 0, iq: 70 };
    }
    setResults({ ...nextResults });

    const jobs = selected.flatMap((model) => QUESTIONS.items.map((q) => ({ model, q })));
    append(`共 ${jobs.length} 题，${workers} 路并行 · bench v6`);

    const ac = new AbortController();
    abortRef.current = ac;
    let cursor = 0;

    async function worker() {
      while (cursor < jobs.length && !stopRef.current) {
        const job = jobs[cursor];
        cursor += 1;
        if (!job) break;
        const { model, q } = job;
        const seed = (Date.now() ^ q.id.charCodeAt(1) * 997 ^ model.length * 13) >>> 0;
        const inst = instantiateQuestion(q, seed);
        const tag = `${model}/${q.id}`;
        append(`→ ${tag} ${q.title}${q.parametric ? ` [${inst.label}]` : ""}`);
        const t0 = performance.now();
        let content = "";
        let preview = "";
        try {
          const resp = await streamChat({
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            model,
            messages: [
              { role: "system", content: QUESTIONS.system },
              { role: "user", content: inst.prompt },
            ],
            signal: ac.signal,
            onDelta: ({ content: c, reasoning: r }) => {
              const shown = (r ? `【思考】${r.slice(-280)}\n` : "") + c.slice(-500);
              setLiveJobs((prev) => ({ ...prev, [tag]: shown }));
            },
            onRetry: (attempt, max, reason) => {
              append(`  ${tag} 网络抖动，重试 ${attempt}/${max}：${reason.slice(0, 80)}`);
            },
          });
          content = (resp.content || "") + (resp.reasoning ? "\n" + resp.reasoning : "");
          preview = (resp.content || "").slice(0, 2500);
          if (!content.trim() && !stopRef.current) {
            const again = await streamChat({
              baseUrl: baseUrl.trim(),
              apiKey: apiKey.trim(),
              model,
              messages: [
                { role: "system", content: QUESTIONS.compactSystem },
                { role: "user", content: inst.prompt },
              ],
              signal: ac.signal,
              onDelta: ({ content: c, reasoning: r }) => {
                const shown = (r ? `【思考】${r.slice(-280)}\n` : "") + c.slice(-500);
                setLiveJobs((prev) => ({ ...prev, [tag]: shown }));
              },
              onRetry: (attempt, max, reason) => {
                append(`  ${tag} 压缩重试 ${attempt}/${max}：${reason.slice(0, 80)}`);
              },
            });
            content = (again.content || "") + (again.reasoning ? "\n" + again.reasoning : "");
            preview = (again.content || "").slice(0, 2500);
          }
        } catch (e) {
          if (stopRef.current || (e instanceof Error && e.name === "AbortError")) {
            preview = "已停止";
          } else {
            preview = e instanceof Error ? e.message : String(e);
          }
        }
        const dt = (performance.now() - t0) / 1000;
        const judged = content
          ? judgeItem(q, content, dt, inst.judge)
          : { ok: false, score: 0, accuracy: 0, speedFactor: 0, detail: preview, tags: ["超预算无产出"] };
        const write = (id: string, j: typeof judged, more?: Partial<ItemResult>) => {
          bucket.items[id] = {
            ok: j.ok,
            score: j.score,
            accuracy: j.accuracy,
            speedFactor: j.speedFactor,
            detail: j.detail,
            seconds: Number(dt.toFixed(1)),
            memorized21: j.memorized21,
            tags: j.tags,
            preview,
            ...more,
          };
        };
        const bucket = nextResults[model];
        if (judged.extra) {
          write("Q16", judged, {
            svg: judged.svg || extractSvg(content),
            html: judged.html || extractHtml(content),
          });
          Object.entries(judged.extra).forEach(([id, extra]) => write(id, extra));
        } else {
          write(q.id, judged, {
            svg: judged.svg,
            html: judged.html,
          });
        }
        const scored = Object.entries(bucket.items).filter(([id]) => id !== "Q16");
        bucket.total = scored.reduce((s, [, it]) => s + it.score, 0);
        bucket.seconds = scored.reduce((s, [, it]) => s + it.seconds, 0);
        const iq = modelIq(bucket.items);
        const ci = bootstrapIq(bucket.items);
        bucket.iq = iq.iq;
        bucket.iqLo = ci.lo;
        bucket.iqHi = ci.hi;
        bucket.equalRate = iq.equalRate;
        setResults({ ...nextResults });
        setLiveJobs((prev) => {
          const copy = { ...prev };
          delete copy[tag];
          return copy;
        });
        append(
          `  ${tag} ${judged.ok ? "OK" : "FAIL"} 准${judged.accuracy}×速${judged.speedFactor.toFixed(2)}=${judged.score} ${dt.toFixed(1)}s`,
        );
      }
    }

    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, () => worker()));

    if (Object.keys(nextResults).length) {
      const finished = makeRun(baseUrl, apiKey, nextResults);
      saveRun(finished);
      setHistTick((n) => n + 1);
      if (user) {
        saveCloudRun({ data: finished }).catch(() => {
          /* 游客不同步 */
        });
      }
    }
    setLiveJobs({});
    setRunning(false);
    setStatus(stopRef.current ? "已停止" : "完成");
    append("全部结束");
  }

  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ questions: QUESTIONS, results }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "iqbench-results.json";
    a.click();
  }

  function openReport() {
    if (!Object.keys(results).length) {
      append("先跑完测评再导出报告");
      return;
    }
    setReportHtml(buildReportHtml(results, { baseUrl }));
  }

  function saveReport() {
    if (!Object.keys(results).length) return;
    downloadReport(reportHtml ?? buildReportHtml(results, { baseUrl }));
    append("已下载 HTML 报告");
  }

  const modelNames = Object.keys(results);
  const avg = modelNames.length
    ? modelNames.reduce((s, m) => s + results[m].total, 0) / modelNames.length
    : null;
  const avgIq = modelNames.length
    ? Math.round(modelNames.reduce((s, m) => s + (results[m].iq || 70), 0) / modelNames.length)
    : null;

  const dimBars = useMemo(() => {
    return QUESTIONS.dimensions.map((d) => {
      let got = 0;
      let max = 0;
      modelNames.forEach((m) => {
        UNITS.forEach((u) => {
          if (u.dim !== d.id) return;
          const it = results[m].items[u.id];
          if (!it) return;
          got += it.score;
          max += u.score;
        });
      });
      return { ...d, pct: max ? Math.round((100 * got) / max) : 0 };
    });
  }, [results, modelNames]);

  const liveEntries = Object.entries(liveJobs);

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase sm:text-xs sm:tracking-[0.2em]">
            思考 xhigh · bench v6 · 100=对一半
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">模型智商测评台</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Key 只留本标签页。IQ 55–145（100=对一半）。参数化题每次换实例。画廊是 Q16 鹈鹕。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SignedIn>
            <span className="hidden sm:inline text-xs text-muted">已登录 · 可上榜</span>
          </SignedIn>
          <SignedOut>
            <span className="hidden sm:inline text-xs text-muted">游客 · 仅本机</span>
          </SignedOut>
          <AuthSlot />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6">
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="form-grid grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">API Base URL（到 /v1）</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-fg outline-none focus:border-primary sm:text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">API Key（不入库、不上报）</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="只在本标签页使用"
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-fg outline-none focus:border-primary sm:text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-3 text-xs text-muted sm:flex-row sm:flex-wrap sm:items-center">
            <label className="inline-flex items-start gap-2 leading-5">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={rememberKey}
                onChange={(e) => setRememberKey(e.target.checked)}
              />
              <span>本页记住 Key（关页即清）</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="shrink-0">并行</span>
              <select
                value={workers}
                onChange={(e) => setWorkers(Number(e.target.value))}
                className="h-9 w-24 shrink-0 rounded-md border border-border bg-surface-2 px-2 text-fg"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} 路
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-grid mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={fetchModels}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-2 text-sm font-medium sm:w-auto sm:px-4"
            >
              <ListChecks className="size-4 shrink-0" />
              拉取模型
            </button>
            <button
              type="button"
              onClick={selectChat}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border px-2 text-sm sm:w-auto sm:px-4"
            >
              只选对话
            </button>
            <button
              type="button"
              disabled={running}
              onClick={run}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-fg disabled:opacity-60 sm:w-auto sm:px-4"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              一键测评
            </button>
            {running ? (
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                  abortRef.current?.abort();
                  append("停止请求已发出");
                }}
                className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border px-2 text-sm sm:w-auto sm:px-4"
              >
                <Square className="size-4" />
                停止
              </button>
            ) : null}
            <button
              type="button"
              onClick={openReport}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-fg sm:w-auto sm:px-4"
            >
              <FileText className="size-4" />
              导出报告
            </button>
            <a
              href="/iqbench-spec.md"
              download="iqbench-spec.md"
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border px-2 text-sm sm:w-auto sm:px-4"
            >
              <Download className="size-4" />
              题库规格
            </a>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border px-2 text-sm sm:w-auto sm:px-4"
            >
              <Download className="size-4" />
              导出 JSON
            </button>
            <span className="min-w-0 break-all text-xs text-muted">
              {status}
              {status ? " · " : ""}
              {keyHint(apiKey)} · {hostOf(baseUrl) || "未填主机"}
            </span>
          </div>
          <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-auto">
            {models.length === 0 ? (
              <p className="text-sm text-muted">尚未拉取模型</p>
            ) : (
              models.map((m) => (
                <label
                  key={m.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(picked[m.id])}
                    onChange={(e) => setPicked((p) => ({ ...p, [m.id]: e.target.checked }))}
                  />
                  <span className="max-w-[220px] truncate sm:max-w-none">{m.id}</span>
                  <span className="text-muted">{m.kind}</span>
                </label>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_180px]">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-xs text-muted">实时日志</p>
            <pre
              ref={logEl}
              className="h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-fg/80"
            >
              {log || "等待操作…"}
            </pre>
            {liveEntries.length ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {liveEntries.map(([tag, text]) => (
                  <pre
                    key={tag}
                    className="max-h-36 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-lg bg-bg px-2 py-2 font-mono text-[11px] leading-5 text-primary/90"
                  >
                    {tag}
                    {"\n"}
                    {text}
                  </pre>
                ))}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">相对智商指数</p>
            <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-primary">
              {avgIq == null ? "—" : avgIq}
            </p>
            <p className="mt-1 text-xs text-muted">
              {avg == null ? "尚未开始" : `均分 ${avg.toFixed(1)}/${MAX_SCORE} · IQ 55–145`}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-xs text-muted">能力维度得分率</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {dimBars.map((d) => (
              <div key={d.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{d.name}</span>
                  <span className="tabular-nums text-muted">{d.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-xs text-muted">
            成绩表
            {viewing ? (
              <span className="ml-2 text-primary">
                历史 {new Date(viewing.createdAt).toLocaleString("zh-CN", { hour12: false })}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => {
                    setViewing(null);
                    setResults({});
                  }}
                >
                  回到本场
                </button>
              </span>
            ) : (
              " · 仅当前这把 Key 的本场"
            )}
          </p>
          <div className="mobile-only grid gap-3">
            {modelNames.length === 0 ? (
              <p className="text-sm text-muted">测评后在此显示对错与分数</p>
            ) : (
              modelNames.map((m) => {
                const r = results[m];
                return (
                  <article key={m} className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-all text-sm font-medium">{m}</p>
                      <p className="shrink-0 font-mono text-2xl font-semibold text-primary">{r.iq}</p>
                    </div>
                    <p className="text-xs text-muted">
                      {r.total}/{r.max}
                      {r.iqLo != null ? ` · ${r.iqLo}–${r.iqHi}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {UNITS.map((u) => {
                        const it = r.items[u.id];
                        return (
                          <span
                            key={u.id}
                            title={it?.detail || u.title}
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                              !it ? "bg-bg text-muted" : it.ok ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"
                            }`}
                          >
                            {u.id.replace("Q", "")} {it ? it.score : "—"}
                          </span>
                        );
                      })}
                    </div>
                  </article>
                );
              })
            )}
          </div>
          <div className="desk-only overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-2 pr-2 font-medium">模型</th>
                  {UNITS.map((u) => (
                    <th key={u.id} className="pb-2 pr-2 font-medium" title={u.title}>
                      {u.id}
                    </th>
                  ))}
                  <th className="pb-2 font-medium">总分</th>
                  <th className="pb-2 font-medium">IQ</th>
                </tr>
              </thead>
              <tbody>
                {modelNames.length === 0 ? (
                  <tr>
                    <td colSpan={UNITS.length + 3} className="py-6 text-muted">
                      测评后在此显示对错与分数
                    </td>
                  </tr>
                ) : (
                  modelNames.map((m) => {
                    const r = results[m];
                    return (
                      <tr key={m} className="border-t border-border">
                        <td className="py-2 pr-2 font-medium">{m}</td>
                        {UNITS.map((u) => {
                          const it = r.items[u.id];
                          if (!it)
                            return (
                              <td key={u.id} className="py-2 pr-2 text-muted">
                                —
                              </td>
                            );
                          return (
                            <td
                              key={u.id}
                              className={`py-2 pr-2 tabular-nums ${it.ok ? "text-ok" : "text-bad"}`}
                            >
                              {it.ok ? "✓" : "✗"} {it.score}
                              {it.tags?.[0] ? ` ${it.tags[0]}` : ""}
                            </td>
                          );
                        })}
                        <td className="py-2 tabular-nums font-semibold">
                          {r.total}/{r.max}
                        </td>
                        <td className="py-2 tabular-nums font-semibold text-primary" title={r.iqLo != null ? `${r.iqLo}–${r.iqHi}` : ""}>
                          {r.iq}
                          {r.iqLo != null ? (
                            <span className="block text-[10px] font-normal text-muted">
                              {r.iqLo}–{r.iqHi}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-xs text-muted">鹈鹕骑车画廊（须为踩踏 SVG 动画）</p>
          <div className="grid items-stretch gap-3 sm:grid-cols-2">
            {modelNames.filter((m) => results[m].items.Q16).length === 0 ? (
              <p className="text-sm text-muted">Q16 完成后在此渲染</p>
            ) : (
              modelNames.map((m) => {
                const it = results[m].items.Q16;
                if (!it) return null;
                return (
                  <div key={m} className="flex min-w-0 flex-col">
                    <div className="mb-2 min-h-[3.25rem]">
                      <p className="truncate text-xs font-medium text-fg">
                        {m}
                        <span className="ml-1.5 font-normal text-muted">
                          {it.score}/14
                          {it.tags?.[0] ? ` · ${it.tags[0]}` : ""}
                        </span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted" title={it.detail}>
                        {it.detail}
                      </p>
                    </div>
                    <div className="gallery-frame">
                      {it.html || it.svg ? (
                        <iframe
                          sandbox="allow-same-origin"
                          title={`${m} pelican`}
                          srcDoc={gallerySrcDoc(it.html, it.svg)}
                          className="absolute inset-0 h-full w-full border-0"
                        />
                      ) : (
                        <p className="absolute inset-0 grid place-items-center p-6 text-sm text-ink/60">
                          无 HTML/SVG 代码
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-xs text-muted">逐题详情</p>
          {modelNames.length === 0 ? (
            <p className="text-sm text-muted">尚无详情</p>
          ) : (
            modelNames.map((m) => {
              const r = results[m];
              return (
                <details key={m} className="border-t border-border py-3">
                  <summary className="cursor-pointer break-all font-medium">
                    {m}（{r.total}/{r.max} · IQ {r.iq}）
                  </summary>
                  {UNITS.map((q) => {
                    const it = r.items[q.id];
                    if (!it) return null;
                    return (
                      <div key={q.id} className="mt-3">
                        <p className="text-sm">
                          <span className="font-medium">
                            {q.id} {q.title}
                          </span>{" "}
                          · {it.ok ? "通过" : "未过"} · 准{it.accuracy} × 速
                          {it.speedFactor.toFixed(2)} = {it.score}/{q.score} · {it.seconds}s
                        </p>
                        <p className="text-xs text-muted">{it.detail}</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-fg/70">
                          {(it.preview || "").slice(-1200)}
                        </pre>
                      </div>
                    );
                  })}
                </details>
              );
            })
          )}
        </section>

        <BenchArchive
          host={hostOf(baseUrl)}
          keyFp={keyFp(apiKey)}
          signedIn={Boolean(user)}
          refresh={histTick}
          onChanged={() => {
            setViewing(null);
            setHistTick((n) => n + 1);
          }}
          onOpen={(run) => {
            setViewing(run);
            const mapped: Record<string, ModelResult> = {};
            for (const m of run.models) {
              mapped[m.id] = {
                total: m.total,
                max: m.max,
                seconds: m.seconds,
                iq: m.iq ?? modelIq(m.items).iq,
                items: Object.fromEntries(
                  Object.entries(m.items).map(([id, it]) => [
                    id,
                    {
                      ...it,
                      preview: "",
                      svg: it.svg || "",
                      html: it.html || "",
                    },
                  ]),
                ),
              };
            }
            setResults(mapped);
            setStatus("已载入历史场次（只读对照）");
          }}
        />
      </div>

      {reportHtml ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg/80">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-paper text-ink sm:my-6 sm:h-auto sm:min-h-0 sm:flex-1 sm:rounded-2xl sm:border sm:border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <p className="text-sm font-medium">测评报告预览</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveReport}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg"
                >
                  <Download className="size-4" />
                  下载 HTML
                </button>
                <button
                  type="button"
                  onClick={() => setReportHtml(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                >
                  <X className="size-4" />
                  关闭
                </button>
              </div>
            </div>
            <iframe
              title="测评报告"
              srcDoc={reportHtml}
              className="min-h-0 flex-1 w-full border-0 bg-paper"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

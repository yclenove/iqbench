import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppHeader } from "@/components/app-header";
import { MAX_SCORE, QUESTIONS, UNITS, bootstrapIq, instantiateQuestion, modelIq } from "@/lib/questions";
import { extractHtml, extractSvg, gallerySrcDoc, isGatewayJunk, judgeItem, shortFail } from "@/lib/judge";
import { craftLine, priorCraftScores, scoreCraft } from "@/lib/svg-craft";
import { listModels } from "@/lib/proxy";
import { streamChat, withRetry } from "@/lib/stream-chat";
import { buildReportHtml, downloadReport } from "@/lib/report";
import {
  baselineLine,
  baselineVerdict,
  hostOf,
  keyFp,
  keyHint,
  loadHostPublic,
  makeRun,
  maskHost,
  saveHostPublicPref,
  saveRun,
  wipeLegacy,
  loadRuns,
  type Baseline,
  type BenchRun,
} from "@/lib/bench-store";
import {
  clearDraft,
  draftSummary,
  emptyFailTag,
  loadDraft,
  missingJobs,
  retryableJobs,
  runGaps,
  writeDraft,
  type BenchDraft,
  type Job,
} from "@/lib/bench-draft";
import { listCloudRuns, modelBaselines, saveCloudRun } from "@/lib/bench-db";
import { BenchArchive } from "@/components/bench-archive";
import { patchLive } from "@/lib/live-bench";
import {
  IDENTITY_QUESTION,
  JUICE_QUESTION,
  KNOWLEDGE_LADDER,
  PROBE_SYSTEM,
  judgeJuice,
  judgeKnowledge,
  ladderAgeDays,
  probeLine,
  summarizeProbe,
  takeIdentity,
  freshnessLabel,
  juiceLabel,
  type ProbeResult,
  type ProbeRow,
} from "@/lib/probes";

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>) => ({
    tab: raw.tab === "board" ? ("board" as const) : undefined,
  }),
  component: Home,
});

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
  craft?: import("@/lib/svg-craft").SvgCraft;
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
  probe?: ProbeResult;
  baseline?: Baseline;
};

function mapRun(run: BenchRun): Record<string, ModelResult> {
  const mapped: Record<string, ModelResult> = {};
  for (const m of run.models) {
    mapped[m.id] = {
      total: m.total,
      max: m.max,
      seconds: m.seconds,
      iq: m.iq ?? modelIq(m.items).iq,
      probe: m.probe,
      baseline: m.baseline,
      items: Object.fromEntries(
        Object.entries(m.items).map(([id, it]) => [
          id,
          { ...it, preview: "", svg: it.svg || "", html: it.html || "" },
        ]),
      ),
    };
  }
  return mapped;
}

function Home() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [workers, setWorkers] = useState(3);
  const [probeOn, setProbeOn] = useState(true);
  const [hostPublic, setHostPublic] = useState(false);
  const [models, setModels] = useState<ModelOpt[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [modelQuery, setModelQuery] = useState("");
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
  const [draft, setDraft] = useState<BenchDraft | null>(null);
  const draftIdRef = useRef("");
  const logEl = useRef<HTMLPreElement>(null);
  const { user } = useCurrentUserState();
  const userRef = useRef(user);
  userRef.current = user;
  const cfgReady = useRef(false);
  const prevScope = useRef("");

  useEffect(() => {
    wipeLegacy();
    try {
      const c = JSON.parse(localStorage.getItem("iqbench_cfg") || "{}") as {
        base?: string;
        workers?: number;
        probe?: boolean;
        hostPublic?: boolean;
      };
      if (c.base) setBaseUrl(c.base);
      if (c.workers) setWorkers(Math.min(8, Math.max(1, c.workers)));
      if (typeof c.probe === "boolean") setProbeOn(c.probe);
      if (typeof c.hostPublic === "boolean") setHostPublic(c.hostPublic);
      const sessionKey = sessionStorage.getItem("iqbench_key");
      if (sessionKey) {
        setApiKey(sessionKey);
        setRememberKey(true);
      }
    } catch {
      /* ignore */
    }
    cfgReady.current = true;
    try {
      const openId = sessionStorage.getItem("iqbench_open_run");
      if (openId) {
        sessionStorage.removeItem("iqbench_open_run");
        const hit = loadRuns().find((r) => r.id === openId);
        if (hit) {
          setViewing(hit);
          setResults(mapRun(hit));
          setStatus("已载入历史场次（只读对照）");
        }
      }
    } catch {
      /* ignore */
    }
    setDraft(loadDraft());
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
    withRetry(() => listCloudRuns())
      .then(async (cloud) => {
        cloud.forEach((r) => {
          if (r?.id && r.models) saveRun(r);
        });
        const have = new Set(cloud.map((r) => r.id));
        const pending = loadRuns()
          .filter((r) => r.id && !have.has(r.id) && runGaps(r).miss.length === 0)
          .slice(0, 8);
        for (const r of pending) {
          try {
            await saveCloudRun({ data: r });
          } catch {
            /* 过期场次或未登录 */
          }
        }
        setHistTick((n) => n + 1);
      })
      .catch(() => {
        /* 未登录 */
      });
  }, [user]);

  useEffect(() => {
    const h = hostOf(baseUrl);
    if (!h) return;
    setHostPublic(loadHostPublic(h));
  }, [baseUrl]);

  useEffect(() => {
    if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight;
  }, [log]);

  const append = (line: string) => setLog((s) => s + line + "\n");

  const saveCfg = () => {
    localStorage.setItem("iqbench_cfg", JSON.stringify({ base: baseUrl, workers, probe: probeOn }));
    saveHostPublicPref(hostOf(baseUrl), hostPublic);
    if (rememberKey && apiKey) sessionStorage.setItem("iqbench_key", apiKey);
    else sessionStorage.removeItem("iqbench_key");
  };

  const selected = models.filter((m) => picked[m.id]).map((m) => m.id);
  const visibleModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.kind.toLowerCase().includes(q));
  }, [models, modelQuery]);

  async function fetchModels() {
    saveCfg();
    setStatus("拉取模型中…");
    try {
      const data = await withRetry(() =>
        listModels({ data: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() } }),
      );
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

  function pickVisible(on: boolean) {
    setPicked((p) => {
      const next = { ...p };
      visibleModels.forEach((m) => {
        next[m.id] = on;
      });
      return next;
    });
  }

  function invertVisible() {
    setPicked((p) => {
      const next = { ...p };
      visibleModels.forEach((m) => {
        next[m.id] = !p[m.id];
      });
      return next;
    });
  }

  function snapDraft(modelIds: string[], nextResults: Record<string, ModelResult>) {
    const id = draftIdRef.current || `draft_${Date.now()}`;
    draftIdRef.current = id;
    writeDraft({
      id,
      createdAt: draft?.id === id ? draft.createdAt : new Date().toISOString(),
      host: hostOf(baseUrl),
      keyFp: keyFp(apiKey),
      workers,
      probeOn,
      hostPublic,
      models: modelIds,
      results: nextResults,
    });
    setDraft(loadDraft());
  }

  async function run(opts?: { resume?: boolean; retryFailed?: boolean; fromRun?: BenchRun }) {
    let modelIds = selected;
    let nextResults: Record<string, ModelResult> = {};
    let jobList: Job[] = [];
    const nWorkers = Math.min(8, Math.max(1, workers));

    if (opts?.fromRun) {
      if (opts.fromRun.benchVer !== 7) {
        append("题库版本已换，这场不能续，请新开测评");
        return;
      }
      nextResults = mapRun(opts.fromRun);
      modelIds = opts.fromRun.models.map((m) => m.id);
      draftIdRef.current = opts.fromRun.id;
      jobList = opts.retryFailed ? retryableJobs(nextResults, modelIds) : missingJobs(nextResults, modelIds);
      if (!jobList.length && opts.retryFailed) {
        append("没有可重试的网络失败题");
        return;
      }
      if (!jobList.length) jobList = retryableJobs(nextResults, modelIds);
    } else if (opts?.resume && draft) {
      if (draft.benchVer !== 7) {
        append("题库版本已换，草稿作废");
        clearDraft();
        setDraft(null);
        return;
      }
      if (apiKey && keyFp(apiKey) !== draft.keyFp) {
        append("当前 Key 和草稿不是同一把，请填回原来的 Key 再续");
        setStatus("Key 对不上，无法续测");
        return;
      }
      if (!apiKey) {
        append("续测需要再填一次 Key");
        setStatus("先填 Key 再续测");
        return;
      }
      nextResults = mapRun({
        id: draft.id,
        createdAt: draft.createdAt,
        host: draft.host,
        keyFp: draft.keyFp,
        keyHint: "",
        benchVer: draft.benchVer,
        maxScore: MAX_SCORE,
        models: draft.results,
      });
      modelIds = draft.models;
      draftIdRef.current = draft.id;
      jobList = missingJobs(nextResults, modelIds);
      if (!jobList.length) jobList = retryableJobs(nextResults, modelIds);
    } else if (opts?.retryFailed) {
      nextResults = { ...results };
      modelIds = Object.keys(nextResults);
      jobList = retryableJobs(nextResults, modelIds);
      if (!jobList.length) {
        append("没有可重试的网络失败题（判错的不算）");
        return;
      }
    } else {
      if (!selected.length) {
        append("先拉模型并至少选一个");
        setStatus("先拉模型并至少选一个");
        return;
      }
      modelIds = selected;
      for (const model of modelIds) {
        nextResults[model] = { items: {}, total: 0, max: MAX_SCORE, seconds: 0, iq: 70 };
      }
      jobList = modelIds.flatMap((model) => QUESTIONS.items.map((q) => ({ model, qid: q.id })));
      draftIdRef.current = `draft_${Date.now()}`;
    }

    if (!apiKey || !baseUrl) {
      append("先填 API 地址和 Key");
      return;
    }

    const jobs = jobList
      .map((j) => ({ model: j.model, q: QUESTIONS.items.find((q) => q.id === j.qid) }))
      .filter((j): j is { model: string; q: (typeof QUESTIONS.items)[number] } => Boolean(j.q));

    if (!jobs.length && !(probeOn && !opts?.retryFailed)) {
      append("没有待跑的题");
      return;
    }

    saveCfg();
    stopRef.current = false;
    setViewing(null);
    setPicked((prev) => {
      const next = { ...prev };
      for (const id of modelIds) next[id] = true;
      return next;
    });
    if (models.length === 0) {
      setModels(modelIds.map((id) => ({ id, kind: "chat" })));
    }
    setRunning(true);
    patchLive({ running: true });
    setStatus(`测评中 · ${nWorkers} 路并行`);
    setLiveJobs({});
    setResults({ ...nextResults });
    snapDraft(modelIds, nextResults);
    append(
      `共 ${jobs.length} 题${opts?.resume ? "（续测）" : opts?.retryFailed ? "（重试失败题）" : ""}，${nWorkers} 路并行 · bench v7`,
    );

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
        setLiveJobs((prev) => ({ ...prev, [tag]: "连接中…" }));
        const t0 = performance.now();
        let content = "";
        let preview = "";
        try {
          const resp = await streamChat({
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            model,
            messages: [
              { role: "system", content: q.system ?? QUESTIONS.system },
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
          // 只对正文判分；思维链里的草稿答案不能覆盖最终答案，仅当正文为空时回退
          content = (resp.content || "").trim() ? (resp.content || "") : (resp.reasoning || "");
          preview = (resp.content || "").slice(0, 2500);
          if (!content.trim() && !stopRef.current) {
            const again = await streamChat({
              baseUrl: baseUrl.trim(),
              apiKey: apiKey.trim(),
              model,
              messages: [
                { role: "system", content: q.system ?? QUESTIONS.compactSystem },
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
            content = (again.content || "").trim() ? (again.content || "") : (again.reasoning || "");
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
        const failTag = emptyFailTag(preview);
        const judged = content
          ? judgeItem(q, content, dt, inst.judge)
          : { ok: false, score: 0, accuracy: 0, speedFactor: 0, detail: preview || failTag, tags: [failTag] };
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
        const junk = isGatewayJunk(content) || isGatewayJunk(preview);
        const art = junk ? "" : judged.svg || extractSvg(content) || judged.html || extractHtml(content) || content;
        const craft =
          q.judge.type === "pelican_html_svg" && !junk
            ? scoreCraft(art, priorCraftScores(model, loadRuns()))
            : undefined;
        if (judged.extra) {
          write("Q16", judged, {
            svg: junk ? "" : judged.svg || extractSvg(content),
            html: junk ? "" : judged.html || extractHtml(content),
            detail: junk ? shortFail(preview || judged.detail) : judged.detail,
            preview: junk ? shortFail(preview) : preview,
            craft,
            tags: [
              ...(judged.tags || []),
              ...(craft?.degraded ? ["画工缩水"] : craft?.sparse ? ["画敷衍"] : []),
            ],
          });
          Object.entries(judged.extra).forEach(([id, extra]) => write(id, extra));
        } else {
          write(q.id, judged, {
            svg: junk ? "" : judged.svg,
            html: junk ? "" : judged.html,
            detail: junk ? shortFail(preview || judged.detail) : judged.detail,
            preview: junk ? shortFail(preview) : preview,
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
        snapDraft(modelIds, nextResults);
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

    await Promise.all(Array.from({ length: Math.min(nWorkers, jobs.length) }, () => worker()));

    const skipProbe = Boolean(opts?.retryFailed);
    if (probeOn && !stopRef.current && !skipProbe) {
      setStatus("渠道鉴定中…");
      append(`渠道鉴定（不计分）：知识阶梯 ${KNOWLEDGE_LADDER.length} 问 + juice + 身份自报`);
      const age = ladderAgeDays();
      if (age > 90) {
        append(`  ⚠ 知识阶梯最新条目距今 ${age} 天，联网探测已失效，建议在 src/lib/probes.ts 补新事件`);
      }
      const probeModels = modelIds.filter((m) => !nextResults[m]?.probe);
      if (!probeModels.length) {
        /* already probed */
      } else {
      let probeCursor = 0;
      // 探针都是琐碎回忆题，单题限时，防止推理型渠道无限磨
      const PROBE_TIMEOUT_MS = 90_000;

      async function askProbe(model: string, tag: string, question: string) {
        try {
          const resp = await streamChat({
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            model,
            messages: [
              { role: "system", content: PROBE_SYSTEM },
              { role: "user", content: question },
            ],
            signal: AbortSignal.any([ac.signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)]),
            onDelta: ({ content: c, reasoning: r }) => {
              const shown = (r ? `【思考】${r.slice(-160)}\n` : "") + c.slice(-300);
              setLiveJobs((prev) => ({ ...prev, [tag]: shown }));
            },
          });
          return (resp.content || "").trim() ? resp.content : resp.reasoning || "";
        } catch {
          return "";
        }
      }

      async function probeWorker() {
        while (probeCursor < probeModels.length && !stopRef.current) {
          const model = probeModels[probeCursor];
          probeCursor += 1;
          if (!model) break;
          const tag = `${model}/鉴定`;
          setLiveJobs((prev) => ({ ...prev, [tag]: "鉴定中…" }));
          const rows: ProbeRow[] = [];
          for (const p of KNOWLEDGE_LADDER) {
            if (stopRef.current) break;
            rows.push(judgeKnowledge(p, await askProbe(model, tag, p.question)));
          }
          if (stopRef.current) break;
          const juice = judgeJuice(await askProbe(model, tag, JUICE_QUESTION));
          const identity = takeIdentity(await askProbe(model, tag, IDENTITY_QUESTION));
          const probe = summarizeProbe(rows, juice, identity);
          nextResults[model].probe = probe;
          setResults({ ...nextResults });
          setLiveJobs((prev) => {
            const copy = { ...prev };
            delete copy[tag];
            return copy;
          });
          append(`  ${model} 鉴定：${probeLine(probe)}`);
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(nWorkers, probeModels.length) }, () => probeWorker()),
      );
      }
    }

    // 降智对照：跟全网同名模型的历史分布比（先比后传，本次成绩不掺进基线）
    if (!stopRef.current) {
      try {
        const base = await withRetry(() => modelBaselines({ data: modelIds }), 2);
        for (const b of base) {
          const bucket = nextResults[b.model];
          if (!bucket || b.runs < 3) continue;
          bucket.baseline = baselineVerdict(bucket.iq, b);
          append(
            `  ${b.model} 对照：${baselineLine(bucket.iq, bucket.baseline)}${bucket.baseline.suspect ? " ⚠" : ""}`,
          );
        }
        setResults({ ...nextResults });
      } catch {
        append("全网对照拉取失败，跳过（不影响成绩）");
      }
    }

    const leftover = missingJobs(nextResults, modelIds);
    if (Object.keys(nextResults).length) {
      const finished = makeRun(baseUrl, apiKey, nextResults, {
        hostPublic,
        id: draftIdRef.current || undefined,
      });
      saveRun(finished);
      setHistTick((n) => n + 1);
      if (leftover.length || stopRef.current) {
        snapDraft(modelIds, nextResults);
        append(`未完成，已存草稿（还剩 ${leftover.length} 题）。刷新后可续测。`);
      } else {
        clearDraft();
        setDraft(null);
        draftIdRef.current = "";
        if (userRef.current) {
          withRetry(() => saveCloudRun({ data: finished }))
            .then(() => append("已写入公开榜"))
            .catch((err) => append(`公开榜同步失败：${err instanceof Error ? err.message : "未知错误"}`));
        } else {
          append("未登录，本场只留本机。登录（L站 / Google / X）后才会上公开榜");
        }
      }
    }
    setLiveJobs({});
    setRunning(false);
    patchLive({ running: false });
    setStatus(stopRef.current || leftover.length ? "未完成，可续测" : "完成");
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
      setStatus("先跑完测评再导出报告");
      return;
    }
    setReportHtml(buildReportHtml(results, { baseUrl, hostPublic }));
  }

  function saveReport() {
    if (!Object.keys(results).length) return;
    downloadReport(reportHtml ?? buildReportHtml(results, { baseUrl, hostPublic }));
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
  const ladderAge = useMemo(() => ladderAgeDays(), []);
  const fresh = modelNames.length === 0 && !running;

  const openArchiveRun = (run: BenchRun) => {
    setViewing(run);
    setResults(mapRun(run));
    setStatus("已载入历史场次（只读对照）");
    void navigate({ to: "/", search: { tab: undefined } });
  };

  return (
    <main className="min-h-screen text-fg">
      <AppHeader page={tab === "board" ? "board" : "home"} />

      {tab === "board" ? (
        <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="mb-5 mt-6">
            <p className="kicker">Leaderboard</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">榜单</h1>
            <p className="mt-1 text-sm text-muted">
              模型看中位，渠道看相对增益，测评员看登录用户贡献。游客只留本机；L站 / Google / X 登录后才进公开榜。
            </p>
          </div>
          <BenchArchive
            signedIn={Boolean(user)}
            refresh={histTick}
            onChanged={() => setHistTick((n) => n + 1)}
            onOpen={openArchiveRun}
            onResume={(hist, mode) => void run({ fromRun: hist, retryFailed: mode === "retry" })}
          />
        </div>
      ) : (

      <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6">
        {draft && !running ? (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1">
              有一场未完成
              {(() => {
                const s = draftSummary(draft);
                return `（${s.n} 个模型，还剩 ${s.miss} 题${s.retry ? `，${s.retry} 题可重试` : ""}）`;
              })()}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg"
                onClick={() => void run({ resume: true })}
              >
                继续
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted"
                onClick={() => {
                  clearDraft();
                  setDraft(null);
                  append("已丢弃草稿");
                }}
              >
                丢弃
              </button>
            </div>
          </div>
        ) : null}
        {fresh ? (
          <section className="card mt-2 px-6 py-12 text-center sm:py-16">
            <img src="/favicon.svg" alt="" className="mx-auto size-16 rounded-2xl" />
            <p className="kicker mt-5">Ready · Bench v7</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              大模型<span className="text-primary">能飞</span>
            </p>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              18 个计分单元：最坏保证、抗背题、空间作图、指令遵循。填好下面的地址和 Key，拉模型，一键开测。
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[11px] tracking-[0.15em] text-faint">
              <span>01 填 KEY</span>
              <span aria-hidden="true">→</span>
              <span>02 拉模型</span>
              <span aria-hidden="true">→</span>
              <span>03 一键测评</span>
            </div>
          </section>
        ) : null}

        <section className="card p-4 sm:p-5">
          <p className="kicker mb-3">接入配置</p>
          <div className="form-grid grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-muted">API Base URL（到 /v1）</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-fg outline-none focus:border-primary sm:text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-muted">API Key（明文不入库）</span>
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
          <p className="mt-3 text-[12px] leading-5 text-muted">
            链路：浏览器 → 本站 <code className="font-mono text-[11px] text-faint">/api/bench/chat</code> →
            你的网关。Key 只在这次请求内存里当 Authorization，不写库、不进榜。
            不放心就自己跑源码，Key 只过你电脑：
            <code className="ml-1 break-all font-mono text-[11px] text-faint">npx github:yclenove/iqbench</code>
            <a
              href="https://github.com/yclenove/iqbench"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-fg underline decoration-primary/40 underline-offset-2 hover:text-primary"
            >
              源码
            </a>
          </p>
          <label className="mt-3 inline-flex items-start gap-2 text-[13px] leading-5 text-muted">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={hostPublic}
              onChange={(e) => {
                const on = e.target.checked;
                setHostPublic(on);
                saveHostPublicPref(hostOf(baseUrl), on);
              }}
            />
            <span>
              上榜公开我的渠道地址
              <span className="ml-1 text-faint">
                {hostPublic
                  ? `榜单将显示 ${hostOf(baseUrl) || "完整主机名"}`
                  : `榜单脱敏为 ${baseUrl ? maskHost(hostOf(baseUrl)) : "g2.***.vip"}（按渠道记住）`}
              </span>
            </span>
          </label>
          <div className="mt-4 flex flex-col gap-3.5 text-[13px] text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
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
              <input
                type="number"
                min={1}
                max={8}
                step={1}
                value={workers}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setWorkers(Math.min(8, Math.max(1, Math.round(n))));
                }}
                className="h-9 w-16 rounded-md border border-border bg-surface-2 px-2 text-center text-fg tabular-nums"
                aria-label="并行路数，1 到 8"
              />
              <span className="text-faint">路（1–8）</span>
            </label>
            <label className="inline-flex items-start gap-2 leading-5">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={probeOn}
                onChange={(e) => setProbeOn(e.target.checked)}
              />
              <span>
                渠道鉴定（知识新旧 / juice / 联网嫌疑，不计分）
                {probeOn && ladderAge > 90 ? (
                  <span className="ml-1 text-bad">
                    ⚠ 知识阶梯最新条目距今 {ladderAge} 天，建议补新事件
                  </span>
                ) : null}
              </span>
            </label>
          </div>
          <div className="btn-grid mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={fetchModels}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-2 text-sm font-medium transition-colors hover:border-primary sm:w-auto sm:px-4"
            >
              <ListChecks className="size-4 shrink-0" />
              拉取模型
            </button>
            <button
              type="button"
              onClick={selectChat}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:text-fg sm:w-auto sm:px-3"
            >
              只选对话
            </button>
            <button
              type="button"
              onClick={() => pickVisible(true)}
              disabled={!visibleModels.length}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40 sm:w-auto sm:px-3"
            >
              全选
            </button>
            <button
              type="button"
              onClick={() => pickVisible(false)}
              disabled={!visibleModels.length}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40 sm:w-auto sm:px-3"
            >
              清空
            </button>
            <button
              type="button"
              onClick={invertVisible}
              disabled={!visibleModels.length}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40 sm:w-auto sm:px-3"
            >
              反选
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => void run()}
              className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-5"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              一键测评
            </button>
            {!running && (draft || retryableJobs(results, Object.keys(results)).length) ? (
              <button
                type="button"
                onClick={() =>
                  void run(
                    draft && missingJobs(results, Object.keys(results)).length
                      ? { resume: true }
                      : { retryFailed: true },
                  )
                }
                className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-border px-2 text-sm font-medium transition-colors hover:border-primary sm:w-auto sm:px-4"
              >
                {draft && missingJobs(results, Object.keys(results)).length ? "续测" : "重测失败题"}
              </button>
            ) : null}
            {running ? (
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                  abortRef.current?.abort();
                  append("停止请求已发出");
                }}
                className="inline-flex h-11 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-bad/50 px-2 text-sm text-bad transition-colors hover:border-bad sm:w-auto sm:px-4"
              >
                <Square className="size-4" />
                停止
              </button>
            ) : null}
            <span className="hidden min-w-0 flex-1 items-center justify-end gap-2 text-right font-mono text-[11px] text-muted sm:inline-flex">
              {running ? <span className="size-1.5 animate-pulse rounded-full bg-primary" /> : null}
              <span className="min-w-0 break-all">
                {status}
                {status ? " · " : ""}
                {keyHint(apiKey)} · {hostOf(baseUrl) || "未填主机"}
              </span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={openReport}
              className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-primary"
            >
              <FileText className="size-3.5" />
              导出报告
            </button>
            <a
              href="/iqbench-spec.md"
              download="iqbench-spec.md"
              className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-primary"
            >
              <Download className="size-3.5" />
              题库规格
            </a>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-primary"
            >
              <Download className="size-3.5" />
              导出 JSON
            </button>
            <span className="min-w-0 break-all font-mono text-[11px] text-muted sm:hidden">
              {status}
              {status ? " · " : ""}
              {keyHint(apiKey)} · {hostOf(baseUrl) || "未填主机"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="筛选模型名"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-primary sm:max-w-xs"
            />
            <span className="font-mono text-[11px] text-muted">
              已选 {selected.length}/{models.length}
              {modelQuery.trim() ? ` · 可见 ${visibleModels.length}` : ""}
            </span>
          </div>
          <div className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-auto">
            {models.length === 0 ? (
              <p className="text-sm text-muted">尚未拉取模型</p>
            ) : visibleModels.length === 0 ? (
              <p className="text-sm text-muted">没有匹配「{modelQuery}」的模型</p>
            ) : (
              visibleModels.map((m) => (
                <label
                  key={m.id}
                  className={`inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    picked[m.id]
                      ? "border-primary/70 bg-primary/10 text-fg"
                      : "border-border bg-surface-2 text-muted hover:border-border-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={Boolean(picked[m.id])}
                    onChange={(e) => setPicked((p) => ({ ...p, [m.id]: e.target.checked }))}
                  />
                  <span className="max-w-[220px] truncate sm:max-w-none">{m.id}</span>
                  <span className="text-faint">{m.kind}</span>
                </label>
              ))
            )}
          </div>
        </section>

        {fresh ? null : (
          <>
        <section className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="card p-4">
            <p className="kicker kicker-dim mb-2">
              实时日志
              {running ? (
                <span className="ml-2 normal-case tracking-normal text-muted">
                  在飞 {liveEntries.length} / {workers} 路
                </span>
              ) : null}
            </p>
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
          <div className="card p-4">
            <p className="kicker kicker-dim">相对智商指数</p>
            <p className="mt-1 font-serif text-5xl font-bold tabular-nums text-primary">
              {avgIq == null ? "—" : avgIq}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {avg == null ? "尚未开始" : `均分 ${avg.toFixed(1)}/${MAX_SCORE} · IQ 55–145`}
            </p>
          </div>
        </section>

        <section className="card p-4">
          <p className="kicker kicker-dim mb-3">能力维度得分率</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {dimBars.map((d) => (
              <div key={d.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{d.name}</span>
                  <span className="font-mono tabular-nums text-muted">{d.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary-soft transition-[width] duration-500"
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <p className="kicker mb-3">
            成绩表
            {viewing ? (
              <span className="ml-2 normal-case tracking-normal text-muted">
                历史 {new Date(viewing.createdAt).toLocaleString("zh-CN", { hour12: false })}
                <button
                  type="button"
                  className="ml-2 text-primary underline"
                  onClick={() => {
                    setViewing(null);
                    setResults({});
                  }}
                >
                  回到本场
                </button>
              </span>
            ) : null}
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
                      <p className="shrink-0 font-serif text-2xl font-bold text-primary">{r.iq}</p>
                    </div>
                    <p className="text-xs text-muted">
                      {r.total}/{r.max}
                      {r.iqLo != null ? ` · ${r.iqLo}–${r.iqHi}` : ""}
                    </p>
                    {r.probe ? (
                      <p className="mt-1 break-all text-[11px] leading-4 text-muted">
                        鉴定：{probeLine(r.probe)}
                      </p>
                    ) : null}
                    {r.baseline ? (
                      <p
                        className={`mt-1 break-all text-[11px] leading-4 ${
                          r.baseline.suspect ? "text-bad" : "text-muted"
                        }`}
                      >
                        对照：{baselineLine(r.iq, r.baseline)}
                      </p>
                    ) : null}
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
                <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                  <th className="border-b border-border pb-2 pr-2 text-left font-medium">模型</th>
                  {UNITS.map((u) => (
                    <th key={u.id} className="border-b border-border pb-2 pr-2 text-left font-medium" title={u.title}>
                      {u.id}
                    </th>
                  ))}
                  <th className="border-b border-border pb-2 text-left font-medium">总分</th>
                  <th className="border-b border-border pb-2 text-left font-medium">IQ</th>
                  <th className="border-b border-border pb-2 text-left font-medium">知识</th>
                  <th className="border-b border-border pb-2 text-left font-medium">juice</th>
                </tr>
              </thead>
              <tbody>
                {modelNames.length === 0 ? (
                  <tr>
                    <td colSpan={UNITS.length + 5} className="py-6 text-muted">
                      测评后在此显示对错与分数
                    </td>
                  </tr>
                ) : (
                  modelNames.map((m) => {
                    const r = results[m];
                    return (
                      <tr key={m} className="border-t border-border/60 transition-colors hover:bg-surface-2/40">
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
                        <td className="py-2 tabular-nums" title={r.iqLo != null ? `${r.iqLo}–${r.iqHi}` : ""}>
                          <span className="font-serif text-lg font-bold text-primary">{r.iq}</span>
                          {r.iqLo != null ? (
                            <span className="block font-mono text-[10px] text-muted">
                              {r.iqLo}–{r.iqHi}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-2 font-mono text-[11px] text-muted" title={r.probe ? probeLine(r.probe) : ""}>
                          {freshnessLabel(r.probe)}
                        </td>
                        <td className="py-2 font-mono text-[11px] tabular-nums text-muted">
                          {juiceLabel(r.probe)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-4">
          <p className="kicker kicker-dim mb-3">鹈鹕骑车画廊（须为踩踏 SVG 动画）</p>
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
                        {shortFail(it.detail)}
                      </p>
                      {it.craft ? (
                        <p className={`mt-0.5 font-mono text-[11px] ${it.craft.degraded ? "text-bad" : "text-muted"}`}>
                          {craftLine(it.craft)}
                        </p>
                      ) : null}
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

        <section className="card p-4">
          <p className="kicker kicker-dim mb-3">逐题详情</p>
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
                  {r.baseline ? (
                    <p
                      className={`mt-3 text-xs ${r.baseline.suspect ? "font-medium text-bad" : "text-muted"}`}
                    >
                      全网对照：{baselineLine(r.iq, r.baseline)}
                    </p>
                  ) : null}
                  {r.probe ? (
                    <div className="mt-3 rounded-lg bg-surface-2 p-3">
                      <p className="text-sm font-medium">渠道鉴定（不计分）</p>
                      <p className="mt-1 break-all text-xs text-muted">{probeLine(r.probe)}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.probe.rows.map((row) => (
                          <span
                            key={row.id}
                            title={`${row.event} · 答：${row.answer || "（无回复）"}`}
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                              row.ok
                                ? "bg-ok/15 text-ok"
                                : row.unsure
                                  ? "bg-bg text-muted"
                                  : "bg-bad/15 text-bad"
                            }`}
                          >
                            {row.quarter} {row.ok ? "✓" : row.unsure ? "?" : "✗"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </details>
              );
            })
          )}
        </section>
          </>
        )}
      </div>
      )}

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

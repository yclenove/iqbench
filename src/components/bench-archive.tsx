import { useEffect, useState, type MouseEvent } from "react";
import { History, Trophy, Trash2, Wrench } from "lucide-react";
import { runGaps } from "@/lib/bench-draft";
import {
  displayHost,
  type BenchRun,
  type BoardRow,
  type ChannelRow,
  channelBoard,
  clearAllRuns,
  deleteRun,
  loadRuns,
  modelBoard,
  recomputeLocalIqs,
  runLabel,
} from "@/lib/bench-store";
import {
  clearMyCloudRuns,
  deleteCloudRun,
  publicBoardPack,
  repairPublicIq,
  whoamiAdmin,
  wipePublicBoards,
  type PublicChannelRow,
  type PublicDimRow,
  type PublicModelRow,
  type PublicPairRow,
  type PublicUserRow,
} from "@/lib/bench-db";
import {
  BoardOverview,
  PublicChannelTable,
  PublicModelTable,
  PublicPairBoard,
  PublicUserTable,
} from "@/components/bench-boards";

type Tab = "overview" | "public-model" | "public-channel" | "public-pair" | "public-user" | "local";

export function BenchArchive({
  signedIn,
  onOpen,
  onResume,
  onChanged,
  refresh,
}: {
  signedIn: boolean;
  onOpen: (run: BenchRun) => void;
  onResume?: (run: BenchRun, mode: "continue" | "retry") => void;
  onChanged: () => void;
  refresh: number;
}) {
  const [runs, setRuns] = useState<BenchRun[]>(() => loadRuns());
  const localModels = modelBoard(runs);
  const localChannels = channelBoard(runs);
  const [cloudModels, setCloudModels] = useState<PublicModelRow[]>([]);
  const [cloudChannels, setCloudChannels] = useState<PublicChannelRow[]>([]);
  const [pairs, setPairs] = useState<PublicPairRow[]>([]);
  const [dims, setDims] = useState<PublicDimRow[]>([]);
  const [users, setUsers] = useState<PublicUserRow[]>([]);
  const [admin, setAdmin] = useState(false);
  const [repairMsg, setRepairMsg] = useState("");
  const [repairing, setRepairing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [focusModel, setFocusModel] = useState("");

  useEffect(() => {
    setRuns(loadRuns());
  }, [refresh]);

  useEffect(() => {
    whoamiAdmin()
      .then((s) => setAdmin(Boolean(s.admin)))
      .catch(() => setAdmin(false));
    publicBoardPack()
      .then((pack) => {
        setCloudModels(pack.models);
        setCloudChannels(pack.channels);
        setPairs(pack.pairs);
        setDims(pack.dims);
        setUsers(pack.users ?? []);
      })
      .catch(() => {
        setCloudModels([]);
        setCloudChannels([]);
        setPairs([]);
        setDims([]);
        setUsers([]);
      });
  }, [refresh]);

  const reload = () => {
    setRuns(loadRuns());
    onChanged();
  };

  const handleDelete = (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteRun(id);
    if (signedIn) deleteCloudRun({ data: id }).catch(() => {});
    reload();
  };

  const handleClearLocal = () => {
    if (!confirm("清空这台浏览器里的全部测评历史？不可恢复。")) return;
    clearAllRuns();
    if (signedIn) clearMyCloudRuns().catch(() => {});
    reload();
  };

  const handleWipePublic = () => {
    if (!confirm("清空公开模型榜和渠道榜？")) return;
    wipePublicBoards()
      .then(() => reload())
      .catch(() => reload());
  };

  const handleRepairIq = () => {
    setRepairing(true);
    setRepairMsg("正在按新公式重算…");
    recomputeLocalIqs();
    const done = signedIn && admin
      ? repairPublicIq()
      : Promise.resolve({ updated: 0, unchanged: 0, skipped: 0, leftover: [] as { model: string; iq: number; score: number; max: number }[] });
    done
      .then((s) => {
        const left = (s.leftover || []).map((x) => `${x.model} ${x.iq}（${x.score}/${x.max}）`).join("、");
        setRepairMsg(
          admin
            ? `公开榜已改 ${s.updated} 条，未变 ${s.unchanged}，跳过 ${s.skipped}。${left ? `仍≥145：${left}` : "没有 145 残留。"}`
            : "本机历史已按新公式重算。登录管理员账号才能修公开榜。",
        );
        reload();
      })
      .catch((err) => {
        setRepairMsg(err instanceof Error ? err.message : "修复失败");
        reload();
      })
      .finally(() => setRepairing(false));
  };

  const openPair = (model: string) => {
    setFocusModel(model);
    setTab("public-pair");
  };

  const tabs = (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
      {(
        [
          ["overview", "总览"],
          ["public-model", "模型"],
          ["public-channel", "渠道"],
          ["public-pair", "同模对照"],
          ["public-user", "蹬er"],
          ["local", "本机"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors sm:px-4 ${
            tab === id ? "bg-primary font-medium text-primary-fg" : "text-muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const tools = (
    <>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 text-sm text-muted">
        {signedIn
          ? "登录后本场会同步进公开榜（不含 Key）。L站、Google、X 都可以。"
          : "游客成绩只留这台浏览器。要上公开榜请先登录（L站 / Google / X）。"}
      </p>
      <button
        type="button"
        onClick={handleClearLocal}
        className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-bad transition-colors hover:border-bad"
      >
        清空本机历史
      </button>
      {admin ? (
        <>
          <button
            type="button"
            disabled={repairing}
            onClick={handleRepairIq}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-3 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <Wrench className="size-3.5" />
            {repairing ? "重算中…" : "修复旧榜 IQ"}
          </button>
          <button
            type="button"
            onClick={handleWipePublic}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:text-fg"
          >
            清空公开榜
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={repairing}
          onClick={handleRepairIq}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <Wrench className="size-3.5" />
          重算本机 IQ
        </button>
      )}
    </div>
    {repairMsg ? <p className="mb-4 text-sm text-primary">{repairMsg}</p> : null}
    </>
  );

  const history = (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-3 flex items-center gap-2">
        <History className="size-3.5" />
        本机历史（{runs.length}）
      </p>
      {runs.length === 0 ? (
        <p className="text-sm text-muted">还没有存档。</p>
      ) : (
        <ul className="grid gap-2">
          {runs.map((run) => {
            const lab = runLabel(run);
            const gaps = runGaps(run);
            return (
              <li
                key={run.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-colors hover:border-border-strong"
              >
                <button type="button" onClick={() => onOpen(run)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">
                    {lab.when} · {lab.n} 模
                    {gaps.miss.length ? (
                      <span className="ml-1 text-xs font-normal text-primary">未完成 {gaps.miss.length} 题</span>
                    ) : gaps.retry.length ? (
                      <span className="ml-1 text-xs font-normal text-muted">可重试 {gaps.retry.length}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {lab.topScore} · {lab.topName}
                    {run.host ? ` · ${displayHost(run.host, run.hostPublic)}` : ""}
                  </p>
                </button>
                {onResume && (gaps.miss.length || gaps.retry.length) ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-primary"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onResume(run, gaps.miss.length ? "continue" : "retry");
                    }}
                  >
                    {gaps.miss.length ? "续测" : "重试失败"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-bad"
                  onClick={(e) => handleDelete(e, run.id)}
                  aria-label="删除这场"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div>
      {tabs}
      {tab === "local" || admin ? tools : null}
      {tab === "overview" ? (
        <BoardOverview models={cloudModels} channels={cloudChannels} dims={dims} />
      ) : null}
      {tab === "public-model" ? (
        <PublicModelTable rows={cloudModels} pairs={pairs} onOpenModel={openPair} />
      ) : null}
      {tab === "public-channel" ? <PublicChannelTable rows={cloudChannels} /> : null}
      {tab === "public-pair" ? (
        <PublicPairBoard pairs={pairs} focus={focusModel} onFocus={setFocusModel} />
      ) : null}
      {tab === "public-user" ? <PublicUserTable rows={users} /> : null}
      {tab === "local" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {history}
          <ModelTable title="本机 · 模型榜" rows={localModels} />
          <ChannelTable title="本机 · 渠道榜" rows={localChannels} />
        </div>
      ) : null}
    </div>
  );
}

function Flags({ web, juice, dumb }: { web: boolean; juice: boolean; dumb: boolean }) {
  const tags = [web && "联网", juice && "juice", dumb && "降智"].filter(Boolean) as string[];
  if (!tags.length) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded border border-bad/40 bg-bad/10 px-1.5 py-0.5 font-mono text-[10px] text-bad">
          ⚠ {t}
        </span>
      ))}
    </span>
  );
}

function CardShell({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-3 flex items-center gap-2">
        <Trophy className="size-3.5" />
        {title}
      </p>
      {children ?? <p className="text-sm text-muted">{empty}</p>}
    </section>
  );
}

const headCell = "border-b border-border pb-2 pr-3 text-left font-medium";
const cell = "py-2 pr-3";

function ModelTable({ title, rows }: { title: string; rows: BoardRow[] }) {
  return (
    <CardShell title={title} empty="暂无成绩">
      {rows.length === 0 ? null : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className={headCell}>#</th>
                <th className={headCell}>模型</th>
                <th className={headCell}>最佳 IQ</th>
                <th className={headCell}>最近</th>
                <th className={headCell}>卷面</th>
                <th className={headCell}>知识</th>
                <th className={headCell}>次数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model} className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40">
                  <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                  <td className={`${cell} font-medium`}>{r.model}</td>
                  <td className={`${cell} tabular-nums`}>
                    <span className="font-serif text-base font-bold text-primary">{r.iq}</span>
                  </td>
                  <td className={`${cell} tabular-nums ${r.lastIq + 8 < r.iq ? "text-bad" : "text-muted"}`}>
                    {r.lastIq}
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {r.best}/{r.max}
                  </td>
                  <td className={`${cell} font-mono text-xs tabular-nums text-muted`}>{r.freshness ?? "—"}</td>
                  <td className={`${cell} tabular-nums`}>{r.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

function ChannelTable({ title, rows }: { title: string; rows: ChannelRow[] }) {
  return (
    <CardShell title={title} empty="暂无渠道数据">
      {rows.length === 0 ? null : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className={headCell}>#</th>
                <th className={headCell}>渠道 / 主机</th>
                <th className={headCell}>均 IQ</th>
                <th className={headCell}>巅峰</th>
                <th className={headCell}>鉴定</th>
                <th className={headCell}>场次</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.host} className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40">
                  <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                  <td className={`${cell} font-medium`}>{r.host}</td>
                  <td className={`${cell} tabular-nums`}>
                    <span className="font-serif text-base font-bold text-primary">{r.avgIq}</span>
                  </td>
                  <td className={`${cell} text-xs`}>
                    {r.bestIq} · {r.topModel}
                  </td>
                  <td className={`${cell} text-xs`}>
                    <Flags web={r.webSuspect} juice={r.juiceSeen} dumb={r.iqSuspect} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{r.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

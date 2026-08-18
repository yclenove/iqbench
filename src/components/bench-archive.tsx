import { useEffect, useState, type MouseEvent } from "react";
import { History, Trophy, Trash2 } from "lucide-react";
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
  runLabel,
} from "@/lib/bench-store";
import {
  clearMyCloudRuns,
  deleteCloudRun,
  publicChannelBoard,
  publicModelBoard,
  whoamiAdmin,
  wipePublicBoards,
  type PublicChannelRow,
  type PublicModelRow,
} from "@/lib/bench-db";

export function BenchArchive({
  signedIn,
  onOpen,
  onChanged,
  refresh,
}: {
  signedIn: boolean;
  onOpen: (run: BenchRun) => void;
  onChanged: () => void;
  refresh: number;
}) {
  const [runs, setRuns] = useState<BenchRun[]>(() => loadRuns());
  const localModels = modelBoard(runs);
  const localChannels = channelBoard(runs);
  const [cloudModels, setCloudModels] = useState<PublicModelRow[]>([]);
  const [cloudChannels, setCloudChannels] = useState<PublicChannelRow[]>([]);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<"public-model" | "public-channel" | "local">("public-model");

  useEffect(() => {
    setRuns(loadRuns());
  }, [refresh]);

  useEffect(() => {
    whoamiAdmin()
      .then((s) => setAdmin(Boolean(s.admin)))
      .catch(() => setAdmin(false));
    publicModelBoard()
      .then(setCloudModels)
      .catch(() => setCloudModels([]));
    publicChannelBoard()
      .then(setCloudChannels)
      .catch(() => setCloudChannels([]));
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

  const tabs = (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
      {(
        [
          ["public-model", "公开模型"],
          ["public-channel", "公开渠道"],
          ["local", "本机"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
            tab === id ? "bg-primary font-medium text-primary-fg" : "text-muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const tools = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 text-sm text-muted">
        {signedIn ? "登录后本场会同步并进入公开榜（不含 Key）。" : "游客成绩只留在这台浏览器。"}
      </p>
      <button
        type="button"
        onClick={handleClearLocal}
        className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-bad transition-colors hover:border-bad"
      >
        清空本机历史
      </button>
      {admin ? (
        <button
          type="button"
          onClick={handleWipePublic}
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:text-fg"
        >
          清空公开榜
        </button>
      ) : null}
    </div>
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
            return (
              <li
                key={run.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-colors hover:border-border-strong"
              >
                <button type="button" onClick={() => onOpen(run)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">
                    {lab.when} · {lab.n} 模
                  </p>
                  <p className="truncate text-xs text-muted">
                    {lab.topScore} · {lab.topName}
                    {run.host ? ` · ${displayHost(run.host, run.hostPublic)}` : ""}
                  </p>
                </button>
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
      {tab === "public-model" ? (
        <PublicModelTable title="公开 · 模型榜" rows={cloudModels} />
      ) : null}
      {tab === "public-channel" ? (
        <PublicChannelTable title="公开 · 渠道榜" rows={cloudChannels} />
      ) : null}
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

function PublicModelTable({ title, rows }: { title: string; rows: PublicModelRow[] }) {
  return (
    <CardShell title={title} empty="公开榜还是空的">
      {rows.length === 0 ? null : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className={headCell}>#</th>
                <th className={headCell}>模型</th>
                <th className={headCell}>最佳 IQ</th>
                <th className={headCell}>卷面</th>
                <th className={headCell}>知识</th>
                <th className={headCell}>样本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model} className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40">
                  <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                  <td className={`${cell} font-medium`}>{r.model}</td>
                  <td className={`${cell} tabular-nums`}>
                    <span className="font-serif text-base font-bold text-primary">{r.best_iq}</span>
                  </td>
                  <td className={`${cell} tabular-nums`}>{r.best_score}</td>
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

function PublicChannelTable({ title, rows }: { title: string; rows: PublicChannelRow[] }) {
  return (
    <CardShell title={title} empty="还没有登录用户贡献渠道数据">
      {rows.length === 0 ? null : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className={headCell}>#</th>
                <th className={headCell}>渠道</th>
                <th className={headCell}>均 IQ</th>
                <th className={headCell}>巅峰 IQ</th>
                <th className={headCell}>鉴定</th>
                <th className={headCell}>模型数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.host} className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40">
                  <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                  <td className={`${cell} font-medium`}>{r.host}</td>
                  <td className={`${cell} tabular-nums`}>
                    <span className="font-serif text-base font-bold text-primary">{r.avg_iq}</span>
                  </td>
                  <td className={`${cell} tabular-nums`}>{r.best_iq}</td>
                  <td className={`${cell} text-xs`}>
                    <Flags web={r.web_suspect} juice={r.juice_seen} dumb={r.iq_suspect} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{r.models}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

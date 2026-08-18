import { useEffect, useState, type MouseEvent } from "react";
import { History, Trophy, Trash2 } from "lucide-react";
import {
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
  host,
  keyFp,
  signedIn,
  onOpen,
  onChanged,
  refresh,
  layout = "embed",
}: {
  host: string;
  keyFp: string;
  signedIn: boolean;
  onOpen: (run: BenchRun) => void;
  onChanged: () => void;
  refresh: number;
  layout?: "embed" | "page";
}) {
  const [runs, setRuns] = useState<BenchRun[]>(() => loadRuns());
  const mine = runs.filter((r) => (!host || r.host === host) && (!keyFp || r.keyFp === keyFp));
  const localModels = modelBoard(layout === "page" ? runs : mine);
  const localChannels = channelBoard(layout === "page" ? runs : mine);
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
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
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
          className={`rounded-lg px-3 py-1.5 text-sm ${
            tab === id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg"
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
        className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-bad"
      >
        清空本机历史
      </button>
      {admin ? (
        <button
          type="button"
          onClick={handleWipePublic}
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs text-muted"
        >
          清空公开榜
        </button>
      ) : null}
    </div>
  );

  const history = (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-xs text-muted">
        <History className="size-3.5" />
        {layout === "page" ? `本机历史（${mine.length}）` : `本钥匙历史（${mine.length}）`}
      </p>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">{layout === "page" ? "还没有存档。" : "这把 Key 还没有存档。"}</p>
      ) : (
        <ul className="grid gap-2">
          {mine.map((run) => {
            const lab = runLabel(run);
            return (
              <li
                key={run.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <button type="button" onClick={() => onOpen(run)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">
                    {lab.when} · {lab.n} 模
                  </p>
                  <p className="truncate text-xs text-muted">
                    {lab.topScore} · {lab.topName}
                    {layout === "page" && run.host ? ` · ${run.host}` : ""}
                  </p>
                </button>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-bad"
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

  if (layout === "page") {
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

  return (
    <div className="grid gap-4">
      {tools}
      <div className="grid gap-4 lg:grid-cols-2">
        {history}
        <ModelTable title="本机 · 模型历史榜" rows={localModels} />
        <ChannelTable title="本机 · 渠道历史榜" rows={localChannels} />
        <PublicModelTable title="公开 · 模型历史榜（登录用户贡献）" rows={cloudModels} />
        <PublicChannelTable title="公开 · 渠道历史榜（按网关主机）" rows={cloudChannels} />
      </div>
    </div>
  );
}

function Flags({ web, juice, dumb }: { web: boolean; juice: boolean; dumb: boolean }) {
  const tags = [web && "联网", juice && "juice", dumb && "降智"].filter(Boolean) as string[];
  if (!tags.length) return <span className="text-muted">—</span>;
  return <span className="text-bad">⚠ {tags.join(" / ")}</span>;
}

function ModelTable({ title, rows }: { title: string; rows: BoardRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-xs text-muted">
        <Trophy className="size-3.5" />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">暂无成绩</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">模型</th>
                <th className="pb-2 font-medium">最佳 IQ</th>
                <th className="pb-2 font-medium">卷面</th>
                <th className="pb-2 font-medium">知识</th>
                <th className="pb-2 font-medium">次数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model} className="border-t border-border">
                  <td className="py-2 font-mono text-primary">{i + 1}</td>
                  <td className="py-2 font-medium">{r.model}</td>
                  <td className="py-2 tabular-nums">{r.iq}</td>
                  <td className="py-2 tabular-nums">
                    {r.best}/{r.max}
                  </td>
                  <td className="py-2 text-xs tabular-nums text-muted">{r.freshness ?? "—"}</td>
                  <td className="py-2 tabular-nums">{r.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChannelTable({ title, rows }: { title: string; rows: ChannelRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-xs text-muted">
        <Trophy className="size-3.5" />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">暂无渠道数据</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">渠道 / 主机</th>
                <th className="pb-2 font-medium">均 IQ</th>
                <th className="pb-2 font-medium">巅峰</th>
                <th className="pb-2 font-medium">鉴定</th>
                <th className="pb-2 font-medium">场次</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.host} className="border-t border-border">
                  <td className="py-2 font-mono text-primary">{i + 1}</td>
                  <td className="py-2 font-medium">{r.host}</td>
                  <td className="py-2 tabular-nums">{r.avgIq}</td>
                  <td className="py-2 text-xs">
                    {r.bestIq} · {r.topModel}
                  </td>
                  <td className="py-2 text-xs">
                    <Flags web={r.webSuspect} juice={r.juiceSeen} dumb={r.iqSuspect} />
                  </td>
                  <td className="py-2 tabular-nums">{r.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PublicModelTable({ title, rows }: { title: string; rows: PublicModelRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-xs text-muted">
        <Trophy className="size-3.5" />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">公开榜还是空的</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">模型</th>
                <th className="pb-2 font-medium">最佳 IQ</th>
                <th className="pb-2 font-medium">卷面</th>
                <th className="pb-2 font-medium">知识</th>
                <th className="pb-2 font-medium">样本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model} className="border-t border-border">
                  <td className="py-2 font-mono text-primary">{i + 1}</td>
                  <td className="py-2 font-medium">{r.model}</td>
                  <td className="py-2 tabular-nums">{r.best_iq}</td>
                  <td className="py-2 tabular-nums">{r.best_score}</td>
                  <td className="py-2 text-xs tabular-nums text-muted">{r.freshness ?? "—"}</td>
                  <td className="py-2 tabular-nums">{r.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PublicChannelTable({ title, rows }: { title: string; rows: PublicChannelRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-xs text-muted">
        <Trophy className="size-3.5" />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">还没有登录用户贡献渠道数据</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">渠道</th>
                <th className="pb-2 font-medium">均 IQ</th>
                <th className="pb-2 font-medium">巅峰 IQ</th>
                <th className="pb-2 font-medium">鉴定</th>
                <th className="pb-2 font-medium">模型数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.host} className="border-t border-border">
                  <td className="py-2 font-mono text-primary">{i + 1}</td>
                  <td className="py-2 font-medium">{r.host}</td>
                  <td className="py-2 tabular-nums">{r.avg_iq}</td>
                  <td className="py-2 tabular-nums">{r.best_iq}</td>
                  <td className="py-2 text-xs">
                    <Flags web={r.web_suspect} juice={r.juice_seen} dumb={r.iq_suspect} />
                  </td>
                  <td className="py-2 tabular-nums">{r.models}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

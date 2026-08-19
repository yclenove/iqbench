import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { QUESTIONS } from "@/lib/questions";
import type { PublicChannelRow, PublicDimRow, PublicModelRow, PublicPairRow, PublicUserRow } from "@/lib/bench-db";

const headCell = "border-b border-border pb-2 pr-3 text-left font-medium";
const cell = "py-2.5 pr-3 align-top";

export function topHostsFor(pairs: PublicPairRow[], model: string, n = 3) {
  return pairs
    .filter((p) => p.model === model)
    .sort((a, b) => b.med_iq - a.med_iq || b.best_iq - a.best_iq)
    .slice(0, n);
}

export function boardInsights(
  models: PublicModelRow[],
  channels: PublicChannelRow[],
) {
  const samples = models.reduce((s, m) => s + m.runs, 0);
  const leader = [...models].sort((a, b) => b.med_iq - a.med_iq || b.best_iq - a.best_iq)[0];
  const spread = [...models]
    .filter((m) => m.runs >= 2)
    .sort((a, b) => b.best_iq - b.p25_iq - (a.best_iq - a.p25_iq))[0];
  const lifted = channels.filter((c) => c.lift != null && c.runs >= 2);
  const hot = [...lifted].sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))[0];
  const cold = [...lifted].sort((a, b) => (a.lift ?? 0) - (b.lift ?? 0))[0];
  return { samples, models: models.length, hosts: channels.length, leader, spread, hot, cold };
}

function CardShell({ title, hint, empty, children }: { title: string; hint?: string; empty: string; children?: React.ReactNode }) {
  return (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-1 flex items-center gap-2">
        <Trophy className="size-3.5" />
        {title}
      </p>
      {hint ? <p className="mb-3 text-xs text-muted">{hint}</p> : <div className="mb-3" />}
      {children ?? <p className="text-sm text-muted">{empty}</p>}
    </section>
  );
}

function IqRange({ p25, med, best }: { p25: number; med: number; best: number }) {
  const lo = 55;
  const hi = 145;
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const left = Math.max(0, Math.min(100, ((Math.min(p25, best) - lo) / (hi - lo)) * 100));
  const right = Math.max(0, Math.min(100, ((Math.max(p25, best) - lo) / (hi - lo)) * 100));
  return (
    <div className="relative h-2 w-[4.5rem] rounded-full bg-surface-2 sm:w-24" title={`P25 ${p25} · 中位 ${med} · 巅峰 ${best}`}>
      <div
        className="absolute top-0 h-2 rounded-full bg-primary/35"
        style={{ left: `${left}%`, width: `${Math.max(4, right - left)}%` }}
      />
      <div className="absolute top-[-2px] size-2.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: x(med) }} />
    </div>
  );
}

function Lift({ n }: { n: number | null }) {
  if (n == null) return <span className="text-faint">—</span>;
  const cls = n > 2 ? "text-ok" : n < -2 ? "text-bad" : "text-muted";
  return (
    <span className={`tabular-nums ${cls}`}>
      {n > 0 ? "+" : ""}
      {n}
    </span>
  );
}

export function InsightStrip({
  models,
  channels,
}: {
  models: PublicModelRow[];
  channels: PublicChannelRow[];
}) {
  const s = boardInsights(models, channels);
  if (!models.length) return null;
  const cells = [
    { k: "样本 / 模型 / 渠道", v: `${s.samples} · ${s.models} · ${s.hosts}` },
    { k: "中位榜首", v: s.leader ? `${s.leader.model}  ${s.leader.med_iq}` : "—" },
    { k: "落差最大", v: s.spread ? `${s.spread.model}  ${s.spread.p25_iq}–${s.spread.best_iq}` : "样本不足" },
    {
      k: "渠道冷热",
      v: s.hot || s.cold ? `${s.hot ? `${s.hot.host} +${s.hot.lift}` : "—"} / ${s.cold ? `${s.cold.host} ${s.cold.lift}` : "—"}` : "尚无对照",
    },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cells.map((c) => (
        <div key={c.k} className="rounded-xl border border-border bg-surface px-3 py-3">
          <p className="font-mono text-[10px] tracking-wider text-muted uppercase">{c.k}</p>
          <p className="mt-1 truncate text-sm font-medium" title={c.v}>
            {c.v}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PublicModelTable({
  rows,
  pairs,
  onOpenModel,
}: {
  rows: PublicModelRow[];
  pairs: PublicPairRow[];
  onOpenModel?: (model: string) => void;
}) {
  const [sort, setSort] = useState<"med" | "last" | "best" | "n">("med");
  const ordered = useMemo(() => {
    const copy = [...rows];
    if (sort === "best") copy.sort((a, b) => b.best_iq - a.best_iq || b.med_iq - a.med_iq);
    else if (sort === "last") copy.sort((a, b) => b.last_iq - a.last_iq || b.med_iq - a.med_iq);
    else if (sort === "n") copy.sort((a, b) => b.runs - a.runs || b.med_iq - a.med_iq);
    else copy.sort((a, b) => b.med_iq - a.med_iq || b.best_iq - a.best_iq);
    return copy;
  }, [rows, sort]);

  return (
    <CardShell
      title="模型总榜"
      hint="主排序用中位 IQ。最近是该模型最后一场的分数，方便看有没有掉。"
      empty="公开榜还是空的"
    >
      {rows.length === 0 ? null : (
        <>
          <div className="mb-3 flex flex-wrap gap-1">
            {(
              [
                ["med", "中位"],
                ["last", "最近"],
                ["best", "巅峰"],
                ["n", "样本"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  sort === id ? "bg-primary text-primary-fg" : "border border-border text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                  <th className={headCell}>#</th>
                  <th className={headCell}>模型</th>
                  <th className={headCell}>中位</th>
                  <th className={headCell}>最近</th>
                  <th className={headCell}>分布</th>
                  <th className={headCell}>巅峰</th>
                  <th className={headCell}>前三渠道</th>
                  <th className={headCell}>样本</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r, i) => {
                  const hosts = topHostsFor(pairs, r.model, 3);
                  return (
                    <tr key={r.model} className="border-b border-border/50 last:border-0 hover:bg-surface-2/40">
                      <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                      <td className={`${cell} font-medium`}>
                        <button type="button" className="text-left hover:text-primary" onClick={() => onOpenModel?.(r.model)}>
                          {r.model}
                        </button>
                        {r.freshness ? (
                          <span className="mt-0.5 block font-mono text-[10px] text-faint">{r.freshness}</span>
                        ) : null}
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        <span className="font-serif text-lg font-bold text-primary">{r.med_iq}</span>
                      </td>
                      <td
                        className={`${cell} tabular-nums ${r.last_iq + 8 < r.med_iq ? "text-bad" : r.last_iq > r.med_iq + 4 ? "text-ok" : "text-muted"}`}
                        title="该模型最近一场 IQ"
                      >
                        {r.last_iq}
                      </td>
                      <td className={cell}>
                        <IqRange p25={r.p25_iq} med={r.med_iq} best={r.best_iq} />
                        <p className="mt-1 font-mono text-[10px] text-faint">
                          {r.p25_iq}–{r.best_iq}
                        </p>
                      </td>
                      <td className={`${cell} tabular-nums text-muted`}>{r.best_iq}</td>
                      <td className={cell}>
                        {hosts.length === 0 ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {hosts.map((h, idx) => (
                              <li key={h.host} className="flex min-w-0 items-baseline gap-2 text-xs">
                                <span className="font-mono text-[10px] text-faint">{idx + 1}</span>
                                <span className="min-w-0 truncate" title={h.host}>
                                  {h.host}
                                </span>
                                <span className="shrink-0 tabular-nums text-primary">{h.med_iq}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        {r.runs}
                        <span className="ml-1 text-[10px] text-faint">{r.hosts}渠</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CardShell>
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

export function PublicChannelTable({ rows }: { rows: PublicChannelRow[] }) {
  return (
    <CardShell
      title="渠道总榜"
      hint="增益 = 该渠道 IQ − 同模型全网中位。只挑强模测，增益拉不起来；负值更像降智或限流。"
      empty="还没有登录用户贡献渠道数据"
    >
      {rows.length === 0 ? null : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className={headCell}>#</th>
                <th className={headCell}>渠道</th>
                <th className={headCell}>增益</th>
                <th className={headCell}>中位</th>
                <th className={headCell}>巅峰</th>
                <th className={headCell}>鉴定</th>
                <th className={headCell}>模型 / 样本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.host} className="border-b border-border/50 last:border-0 hover:bg-surface-2/40">
                  <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                  <td className={`${cell} font-medium`}>{r.host}</td>
                  <td className={`${cell} font-serif text-lg font-bold`}>
                    <Lift n={r.lift} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{r.med_iq}</td>
                  <td className={`${cell} tabular-nums text-muted`}>{r.best_iq}</td>
                  <td className={`${cell} text-xs`}>
                    <Flags web={r.web_suspect} juice={r.juice_seen} dumb={r.iq_suspect} />
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {r.models}
                    <span className="text-faint"> / {r.runs}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

export function PublicPairBoard({
  pairs,
  focus,
  onFocus,
}: {
  pairs: PublicPairRow[];
  focus: string;
  onFocus: (model: string) => void;
}) {
  const models = useMemo(() => [...new Set(pairs.map((p) => p.model))].sort(), [pairs]);
  const shown = useMemo(() => {
    const list = focus ? pairs.filter((p) => p.model === focus) : pairs;
    const groups = new Map<string, PublicPairRow[]>();
    for (const p of list) {
      const arr = groups.get(p.model) ?? [];
      arr.push(p);
      groups.set(p.model, arr);
    }
    return [...groups.entries()].map(([model, rows]) => ({
      model,
      rows: [...rows].sort((a, b) => b.med_iq - a.med_iq || b.best_iq - a.best_iq),
    }));
  }, [pairs, focus]);

  return (
    <CardShell
      title="同模跨渠"
      hint="同一模型在不同站点的中位 IQ。用来拆开「模型本身强」和「这条网关在灌水 / 降智」。"
      empty="还没有跨渠道样本"
    >
      {pairs.length === 0 ? null : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted">
              模型
              <select
                className="ml-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm text-fg"
                value={focus}
                onChange={(e) => onFocus(e.target.value)}
              >
                <option value="">全部</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-faint">{shown.reduce((s, g) => s + g.rows.length, 0)} 条对照</p>
          </div>
          <div className="grid gap-3">
            {shown.map((g) => {
              const top = g.rows[0]?.med_iq ?? 0;
              const bot = g.rows[g.rows.length - 1]?.med_iq ?? top;
              return (
                <div key={g.model} className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{g.model}</p>
                    <p className="shrink-0 font-mono text-[10px] text-faint">
                      {g.rows.length} 渠 · 落差 {top - bot}
                    </p>
                  </div>
                  <ul className="grid gap-1.5">
                    {g.rows.map((h, i) => (
                      <li key={h.host} className="flex items-center gap-2 text-sm">
                        <span className="w-4 font-mono text-[10px] text-faint">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate" title={h.host}>
                          {h.host}
                        </span>
                        <span className="w-10 text-right font-mono text-[10px] text-faint">{h.runs}次</span>
                        <span className="w-10 text-right tabular-nums text-primary">{h.med_iq}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </CardShell>
  );
}

export function PublicUserTable({ rows }: { rows: PublicUserRow[] }) {
  return (
    <CardShell
      title="蹬er榜"
      hint="按登录用户聚合中位 IQ。只显示公开昵称，不上报邮箱和 Key。游客不上此榜。"
      empty="还没有登录用户上榜"
    >
      {rows.length === 0 ? null : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className={headCell}>#</th>
                <th className={headCell}>蹬er</th>
                <th className={headCell}>中位</th>
                <th className={headCell}>巅峰</th>
                <th className={headCell}>代表模型</th>
                <th className={headCell}>模型 / 场次</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-border/50 last:border-0 hover:bg-surface-2/40">
                  <td className={`${cell} font-mono text-primary`}>{i + 1}</td>
                  <td className={`${cell} font-medium`}>{r.name}</td>
                  <td className={`${cell} tabular-nums`}>
                    <span className="font-serif text-lg font-bold text-primary">{r.med_iq}</span>
                  </td>
                  <td className={`${cell} tabular-nums text-muted`}>{r.best_iq}</td>
                  <td className={`${cell} max-w-[10rem] truncate text-xs`} title={r.top_model}>
                    {r.top_model}
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {r.models}
                    <span className="text-faint"> / {r.runs}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

export function PublicDimBoard({ rows }: { rows: PublicDimRow[] }) {
  const byDim = useMemo(() => {
    const map = new Map<string, PublicDimRow[]>();
    for (const r of rows) {
      const arr = map.get(r.dim) ?? [];
      arr.push(r);
      map.set(r.dim, arr);
    }
    return QUESTIONS.dimensions.map((d) => ({
      dim: d,
      rows: (map.get(d.id) ?? []).sort((a, b) => b.pct - a.pct).slice(0, 3),
    }));
  }, [rows]);

  return (
    <CardShell
      title="维度榜"
      hint="各能力维度卷面得分率前三。新场次才会写入维度明细，旧数据这一栏可能是空的。"
      empty="还没有带维度明细的成绩"
    >
      {rows.length === 0 ? null : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byDim.map(({ dim, rows: top }) => (
            <div key={dim.id} className="rounded-xl border border-border bg-surface-2/30 p-3">
              <p className="text-sm font-medium">{dim.name}</p>
              <p className="mb-2 font-mono text-[10px] text-faint">权 {dim.weight}</p>
              {top.length === 0 ? (
                <p className="text-xs text-muted">暂无</p>
              ) : (
                <ul className="grid gap-2">
                  {top.map((r) => (
                    <li key={r.model}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">{r.model}</span>
                        <span className="tabular-nums text-primary">{r.pct}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-1 rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, r.pct))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

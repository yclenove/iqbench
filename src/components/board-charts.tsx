import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QUESTIONS } from "@/lib/questions";
import type { PublicChannelRow, PublicDimRow, PublicModelRow } from "@/lib/bench-db";

const ink = {
  bg: "#221d15",
  border: "#3d352b",
  fg: "#f3efe4",
  muted: "#9a9183",
  gold: "#d4a24c",
  ok: "#7cbc7a",
  bad: "#d97868",
};

const tip = {
  contentStyle: {
    background: ink.bg,
    border: `1px solid ${ink.border}`,
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: ink.fg },
  itemStyle: { color: ink.gold },
};

function shortName(s: string, n = 18) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function ModelIqBars({ rows }: { rows: PublicModelRow[] }) {
  const data = [...rows]
    .sort((a, b) => b.med_iq - a.med_iq)
    .slice(0, 12)
    .map((r) => ({ name: shortName(r.model, 22), full: r.model, iq: r.med_iq, n: r.runs }));
  if (!data.length) return null;
  return (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-1">模型中位 IQ</p>
      <p className="mb-3 text-xs text-muted">主榜看这个。55 垫底，145 满分。取前 12。</p>
      <div style={{ height: Math.max(220, Math.min(420, 36 + data.length * 32)) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
            <CartesianGrid stroke={ink.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[55, 145]} tick={{ fill: ink.muted, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={128} tick={{ fill: ink.fg, fontSize: 11 }} />
            <Tooltip
              {...tip}
              formatter={(v: number) => [v, "中位 IQ"]}
              labelFormatter={(_, p) => String(p?.[0]?.payload?.full ?? "")}
            />
            <Bar dataKey="iq" radius={[0, 6, 6, 0]} maxBarSize={18}>
              {data.map((d) => (
                <Cell key={d.full} fill={d.iq >= 120 ? ink.gold : d.iq >= 100 ? "#c4a574" : ink.muted} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function IqBuckets({ rows }: { rows: PublicModelRow[] }) {
  const bins = [
    { key: "55–84", lo: 55, hi: 84 },
    { key: "85–99", lo: 85, hi: 99 },
    { key: "100–114", lo: 100, hi: 114 },
    { key: "115–129", lo: 115, hi: 129 },
    { key: "130–145", lo: 130, hi: 145 },
  ];
  const data = bins.map((b) => ({
    name: b.key,
    n: rows.filter((r) => r.med_iq >= b.lo && r.med_iq <= b.hi).length,
  }));
  if (!rows.length) return null;
  return (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-1">分数段分布</p>
      <p className="mb-3 text-xs text-muted">有多少个模型落在各 IQ 段（按中位）。</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid stroke={ink.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: ink.muted, fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: ink.muted, fontSize: 11 }} width={28} />
            <Tooltip {...tip} formatter={(v: number) => [v, "模型数"]} />
            <Bar dataKey="n" fill={ink.gold} radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function ChannelLiftBars({ rows }: { rows: PublicChannelRow[] }) {
  const data = [...rows]
    .filter((r) => r.lift != null)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    .slice(0, 12)
    .map((r) => ({
      name: shortName(r.host, 20),
      full: r.host,
      lift: r.lift ?? 0,
    }));
  if (!data.length) return null;
  return (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-1">渠道增益</p>
      <p className="mb-3 text-xs text-muted">同一模型在这家比全网中位高还是低。正的偏猛，负的像降智或限流。</p>
      <div style={{ height: Math.max(200, Math.min(380, 36 + data.length * 28)) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
            <CartesianGrid stroke={ink.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: ink.muted, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: ink.fg, fontSize: 11 }} />
            <Tooltip
              {...tip}
              formatter={(v: number) => [v > 0 ? `+${v}` : v, "增益"]}
              labelFormatter={(_, p) => String(p?.[0]?.payload?.full ?? "")}
            />
            <Bar dataKey="lift" radius={[0, 6, 6, 0]} maxBarSize={16}>
              {data.map((d) => (
                <Cell key={d.full} fill={d.lift > 2 ? ink.ok : d.lift < -2 ? ink.bad : ink.gold} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const RADAR_COLORS = [ink.gold, "#7cbc7a", "#6ea8d4"];

export function DimRadar({ rows }: { rows: PublicDimRow[] }) {
  const dims = QUESTIONS.dimensions;
  const scored = new Map<string, number>();
  for (const r of rows) scored.set(r.model, (scored.get(r.model) || 0) + r.n);
  const models = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);
  if (!models.length || !rows.length) return null;
  const data = dims.map((d) => {
    const point: Record<string, string | number> = { dim: d.name };
    for (const m of models) {
      point[m] = rows.find((r) => r.dim === d.id && r.model === m)?.pct ?? 0;
    }
    return point;
  });
  return (
    <section className="card p-4">
      <p className="kicker kicker-dim mb-1">能力雷达</p>
      <p className="mb-3 text-xs text-muted">样本最多的 3 个模型，各维度卷面得分率。</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke={ink.border} />
            <PolarAngleAxis dataKey="dim" tick={{ fill: ink.muted, fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: ink.muted, fontSize: 10 }} />
            {models.map((m, i) => (
              <Radar
                key={m}
                name={shortName(m, 16)}
                dataKey={m}
                stroke={RADAR_COLORS[i]}
                fill={RADAR_COLORS[i]}
                fillOpacity={0.15}
              />
            ))}
            <Tooltip {...tip} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap gap-3 font-mono text-[11px] text-muted">
        {models.map((m, i) => (
          <li key={m} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: RADAR_COLORS[i] }} />
            {shortName(m, 20)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BoardCharts({
  models,
  channels,
  dims,
}: {
  models: PublicModelRow[];
  channels: PublicChannelRow[];
  dims: PublicDimRow[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ModelIqBars rows={models} />
      <IqBuckets rows={models} />
      <ChannelLiftBars rows={channels} />
      <DimRadar rows={dims} />
    </div>
  );
}

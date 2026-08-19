import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { loadVendorStatus, STATUS_GROUPS, type VendorLevel, type VendorRow } from "@/lib/vendor-status";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

const LEVEL_WORD: Record<VendorLevel, string> = {
  ok: "正常",
  minor: "降级",
  major: "故障",
  maint: "维护",
  unknown: "未知",
};

const RANK: Record<VendorLevel, number> = { major: 0, minor: 1, maint: 2, unknown: 3, ok: 4 };

function isBad(level: VendorLevel) {
  return level === "major" || level === "minor";
}

function tone(level: VendorLevel) {
  if (level === "ok") return "text-ok";
  if (level === "minor") return "text-primary";
  if (level === "major") return "text-bad";
  return "text-faint";
}

function barCls(level: VendorLevel) {
  if (level === "ok") return "bg-ok";
  if (level === "minor") return "bg-primary";
  if (level === "major") return "bg-bad";
  if (level === "maint") return "bg-muted";
  return "bg-faint";
}

function StatusPage() {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [at, setAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    let on = true;
    setSpin(true);
    loadVendorStatus({ data: { bust: tick > 0 } })
      .then((pack) => {
        if (!on) return;
        setRows(pack.rows);
        setAt(pack.at);
        setError(false);
      })
      .catch(() => {
        if (on) setError(true);
      })
      .finally(() => {
        if (!on) return;
        setLoading(false);
        setSpin(false);
      });
    return () => {
      on = false;
    };
  }, [tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, VendorRow[]>();
    for (const r of rows) {
      const k = String(r.kind);
      if (!map.has(k)) {
        map.set(k, []);
        order.push(k);
      }
      map.get(k)!.push(r);
    }
    if (!order.length) return STATUS_GROUPS.map((g) => ({ id: g.id, title: g.title, list: [] as VendorRow[] }));
    return order.map((id) => ({
      id,
      title: id,
      list: [...(map.get(id) || [])].sort((a, b) => RANK[a.level] - RANK[b.level] || a.name.localeCompare(b.name)),
    }));
  }, [rows]);

  const bad = useMemo(
    () => [...rows].filter((r) => isBad(r.level)).sort((a, b) => RANK[a.level] - RANK[b.level]),
    [rows],
  );
  const nOk = rows.filter((r) => r.level === "ok").length;
  const nBad = bad.length;
  const clock = at
    ? new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <main className="min-h-screen text-fg">
      <AppHeader page="status" />
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className={`mt-6 rounded-2xl border px-4 py-5 sm:px-6 ${nBad ? "border-bad/40 bg-bad/10" : "border-border bg-surface"}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="kicker">Service status</p>
              <h1 className={`mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl ${nBad ? "text-bad" : "text-ok"}`}>
                {loading ? "拉盘口…" : nBad ? `${nBad} 个服务出现问题` : "各家官方均正常"}
              </h1>
              <p className="mt-2 text-sm text-muted">
                90 天色条来自{" "}
                <a href="https://cleanip.io/status" target="_blank" rel="noreferrer" className="text-fg underline decoration-primary/50 underline-offset-2">
                  CleanIP
                </a>
                对官方页的汇总。更新于 {clock}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTick((n) => n + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted hover:border-primary hover:text-fg"
            >
              <RefreshCw className={`size-4 ${spin ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {groups.map((g) => {
              const ok = g.list.filter((r) => r.level === "ok").length;
              const hurt = g.list.filter((r) => isBad(r.level)).length;
              return (
                <a key={g.id} href={`#g-${g.id}`} className="rounded-xl border border-border bg-bg px-3 py-3 hover:border-primary/50">
                  <p className="truncate font-mono text-[10px] tracking-wider text-muted uppercase">{g.title}</p>
                  <p className={`mt-1 font-serif text-2xl font-bold tabular-nums ${hurt ? "text-bad" : "text-ok"}`}>
                    {loading ? "—" : `${ok}/${g.list.length || "—"}`}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">{hurt ? `${hurt} 个有问题` : "正常"}</p>
                </a>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-xs text-faint">
            正常 {nOk} · 异常 {nBad} · 共 {rows.length}
          </p>
        </section>

        {error ? <p className="mt-4 text-sm text-bad">汇总失败，过一会儿再刷。</p> : null}

        {bad.length ? (
          <section className="mt-6">
            <p className="kicker kicker-dim mb-2">盘中异动</p>
            <div className="overflow-hidden rounded-xl border border-bad/40">
              {bad.map((r) => (
                <VendorCard key={r.id} row={r} hot />
              ))}
            </div>
          </section>
        ) : null}

        {groups.map((g) => {
          const hurt = g.list.filter((r) => isBad(r.level)).length;
          return (
            <section key={g.id} id={`g-${g.id}`} className="mt-8 scroll-mt-20">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{g.title}</h2>
                <p className={`text-xs ${hurt ? "text-bad" : "text-ok"}`}>
                  {loading ? "…" : hurt ? `${hurt} 个有问题` : `${g.list.length} 个全部正常`}
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse border-b border-border last:border-0 bg-surface" />)
                  : g.list.map((r) => <VendorCard key={r.id} row={r} />)}
              </div>
            </section>
          );
        })}

        <p className="mt-8 text-xs text-faint">
          色条与分组接自{" "}
          <a href="https://cleanip.io/status" className="underline decoration-primary/40 underline-offset-2" target="_blank" rel="noreferrer">
            cleanip.io/status
          </a>
          。点色条进该厂商官方状态页。
          <Link to="/" search={{ tab: undefined }} className="ml-2 text-muted underline decoration-primary/40 underline-offset-2">
            回测评
          </Link>
        </p>
      </div>
    </main>
  );
}

function VendorCard({ row, hot }: { row: VendorRow; hot?: boolean }) {
  const bars = row.bars || [];
  return (
    <article
      className={`grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 border-b border-border/70 px-3 py-3 last:border-0 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-4 sm:px-4 ${
        hot ? "bg-bad/10" : row.level === "major" ? "bg-bad/10" : row.level === "minor" ? "bg-primary/5" : "bg-surface"
      }`}
    >
      <a href={row.page} target="_blank" rel="noreferrer" className="flex size-[52px] items-center justify-center rounded-lg border border-border bg-bg sm:size-[72px]">
        {row.logo ? (
          <img src={row.logo} alt="" className="size-8 object-contain sm:size-10" />
        ) : (
          <span className={`size-3 rounded-full ${barCls(row.level)}`} />
        )}
      </a>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <a href={row.page} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold hover:text-primary sm:text-base">
            {row.name}
          </a>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{row.blurb}</span>
          {row.uptimePct != null ? (
            <span className={`shrink-0 tabular-nums ${tone(row.level)}`}>
              <strong className="text-sm">{row.uptimePct.toFixed(2)}%</strong>
              <span className="ml-1 text-[10px] text-faint">90 天可用率</span>
            </span>
          ) : (
            <span className={`shrink-0 text-sm font-semibold ${tone(row.level)}`}>{LEVEL_WORD[row.level]}</span>
          )}
        </div>
        {bars.length ? (
          <a href={row.page} target="_blank" rel="noreferrer" className="mt-2 flex h-5 gap-px overflow-hidden sm:h-[22px] sm:gap-0.5" aria-label={`${row.name} 90 天可用性`}>
            {bars.map((b, i) => (
              <i key={`${b.date}-${i}`} title={b.date} className={`min-w-px flex-1 rounded-sm ${barCls(b.level)}`} />
            ))}
          </a>
        ) : null}
      </div>
    </article>
  );
}

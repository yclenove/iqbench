import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { JntmBanner } from "@/components/jntm-banner";
import { publicPelicanWall } from "@/lib/bench-db";
import { displayHost, loadRuns } from "@/lib/bench-store";
import { PelicanLive } from "@/components/pelican-frame";
import { mergePieces, piecesFromRuns, type PelicanPiece } from "@/lib/pelican-wall";
import { craftLine } from "@/lib/svg-craft";
import { EFFORT_LABEL, isEffortAlias, parseSlot } from "@/lib/effort";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
  head: () => ({
    meta: [{ title: "鸡你太美 · 猛蹬·145" }],
  }),
});

type Filter = "all" | "pass" | "fail" | "local";

function pieceMeta(p: PelicanPiece) {
  const slot = parseSlot(p.model);
  const effort = isEffortAlias(p.model) ? "渠道别名" : EFFORT_LABEL[slot.effort] || slot.effort;
  return [
    ["渠道", displayHost(p.host) || "未标明"],
    ["模型", slot.model],
    ["思维", effort],
    ["蹬er", p.rider || (p.local ? "本机游客" : "未署名")],
  ] as const;
}

function HoverMeta({ p, className = "" }: { p: PelicanPiece; className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-bg/95 via-bg/55 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${className}`}
    >
      <dl className="grid min-w-0 grid-cols-[2.5rem_1fr] gap-x-2 gap-y-0.5 font-mono text-[11px] leading-5">
        {pieceMeta(p).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="min-w-0 truncate text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function GalleryPage() {
  const [remote, setRemote] = useState<PelicanPiece[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<PelicanPiece | null>(null);
  const local = useMemo(() => piecesFromRuns(loadRuns(), true), []);

  useEffect(() => {
    publicPelicanWall()
      .then(setRemote)
      .catch(() => setRemote([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const all = useMemo(() => mergePieces(local, remote), [local, remote]);
  const shown = all.filter((p) => {
    if (filter === "pass") return p.ok;
    if (filter === "fail") return !p.ok;
    if (filter === "local") return p.local;
    return true;
  });
  const ranked = [...shown].sort((a, b) => (b.craft?.score ?? b.score) - (a.craft?.score ?? a.score));
  const star = ranked[0];
  const rest = star ? ranked.slice(1) : ranked;
  const passed = all.filter((p) => p.ok).length;

  return (
    <div className="min-h-svh">
      <AppHeader page="gallery" />
      <main className="px-4 py-8 sm:px-6 sm:py-12">
        <JntmBanner />
        <h1 className="sr-only">鸡你太美</h1>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-xl text-sm text-muted sm:text-base">
            模型用 SVG 画的鹈鹕，骑车的那种。过线的、翻车的、敷衍的，都挂在这儿。
          </p>
          <div className="flex gap-6 font-serif text-primary">
            <div>
              <p className="font-mono text-[10px] tracking-widest text-faint uppercase">只数</p>
              <p className="text-3xl leading-none">{all.length}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-widest text-faint uppercase">过线</p>
              <p className="text-3xl leading-none">{passed}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {(
            [
              ["all", "全部"],
              ["pass", "过线"],
              ["fail", "翻车"],
              ["local", "本机"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === id ? "bg-primary font-medium text-primary-fg" : "border border-border text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {ranked.length === 0 ? (
          <section className="card mt-10 px-6 py-16 text-center">
            <p className="font-serif text-2xl">还没有鹈鹕进馆</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">跑完 Q16 就会出现在这里。公开榜上别人画的也会挂出来。</p>
            <Link
              to="/"
              search={{ tab: undefined }}
              className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
            >
              去测评
            </Link>
          </section>
        ) : (
          <>
            {star ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(star)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(star);
                  }
                }}
                className="card mt-10 w-full cursor-pointer overflow-hidden p-0 text-left"
              >
                <div className="grid md:grid-cols-2">
                  <div className="group relative min-h-[220px]">
                    <PelicanLive html={star.html} svg={star.svg} title={star.model} hero />
                    <HoverMeta p={star} />
                  </div>
                  <div className="flex flex-col justify-between p-5 sm:p-7">
                    <div>
                      <p className="kicker">馆藏头条</p>
                      <h2 className="mt-2 font-serif text-2xl sm:text-3xl">{star.model}</h2>
                      <p className="mt-2 text-sm text-muted">{displayHost(star.host)}</p>
                      <p className="mt-1 font-mono text-[11px] text-faint">
                        {pieceMeta(star)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(" · ")}
                      </p>
                      <p className="mt-4 text-sm leading-6 text-fg/80">{star.detail || "无评语"}</p>
                    </div>
                    <p className="mt-6 font-mono text-xs text-primary">
                      {star.score}/14
                      {star.craft ? ` · ${craftLine(star.craft)}` : ""}
                      {star.local ? " · 本机" : ""}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpen(p);
                    }
                  }}
                  className="group card salon-card cursor-pointer overflow-hidden p-0 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="relative">
                    <PelicanLive html={p.html} svg={p.svg} title={p.model} />
                    <HoverMeta p={p} />
                  </div>
                  <div className="border-t border-border px-3 py-2.5">
                    <p className="truncate text-sm font-medium">{p.model}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                      {p.score}/14 · {displayHost(p.host)}
                      {p.ok ? "" : " · 未过"}
                      {p.local ? " · 本机" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-bg/80 text-fg"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
            <PelicanLive html={open.html} svg={open.svg} title={open.model} hero />
            <div className="p-4 sm:p-5">
              <p className="font-serif text-xl">{open.model}</p>
              <p className="mt-1 text-sm text-muted">
                {pieceMeta(open)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
                {open.score ? ` · ${open.score}/14` : ""}
                {open.local ? " · 本机" : ""}
              </p>
              {open.craft ? <p className="mt-2 font-mono text-xs text-primary">{craftLine(open.craft)}</p> : null}
              <p className="mt-2 text-sm text-muted">{open.detail}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
import type { BenchRun } from "./bench-store";
import type { SvgCraft } from "./svg-craft";

export type PelicanPiece = {
  id: string;
  model: string;
  host: string;
  at: string;
  score: number;
  ok: boolean;
  html?: string;
  svg?: string;
  detail: string;
  craft?: SvgCraft;
  local?: boolean;
};

export function piecesFromRuns(runs: BenchRun[], local = false): PelicanPiece[] {
  const out: PelicanPiece[] = [];
  for (const r of runs) {
    for (const m of r.models) {
      const it = m.items.Q16;
      if (!it || (!it.html && !it.svg)) continue;
      out.push({
        id: `${r.id}:${m.id}`,
        model: m.id,
        host: r.host,
        at: r.createdAt,
        score: it.score,
        ok: Boolean(it.ok),
        html: it.html,
        svg: it.svg,
        detail: it.detail || "",
        craft: it.craft,
        local,
      });
    }
  }
  return out;
}

export function mergePieces(local: PelicanPiece[], remote: PelicanPiece[]) {
  const seen = new Set<string>();
  const out: PelicanPiece[] = [];
  for (const p of [...local, ...remote]) {
    const key = p.id || `${p.model}:${p.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
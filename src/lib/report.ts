import { MAX_SCORE, QUESTIONS, UNITS, modelIq } from "./questions";
import { extractSvg } from "./judge";
import { probeLine, type ProbeResult } from "./probes";
import { baselineLine, type Baseline } from "./bench-store";

export type ItemResult = {
  ok: boolean;
  score: number;
  accuracy?: number;
  speedFactor?: number;
  detail: string;
  seconds: number;
  memorized21?: boolean;
  preview: string;
  svg?: string;
  html?: string;
};

export type ModelResult = {
  items: Record<string, ItemResult>;
  total: number;
  max: number;
  seconds: number;
  iq?: number;
  probe?: ProbeResult;
  baseline?: Baseline;
};

export type ReportMeta = {
  baseHost: string;
  generatedAt: string;
};

function pelicanOf(it?: ItemResult) {
  if (!it) return "";
  return extractSvg(it.svg || "") || extractSvg(it.html || "") || extractSvg(it.preview || "");
}

function esc(s: string) {
  return s
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl || "未填写接口";
  }
}

function rankLabel(pct: number) {
  if (pct >= 90) return { name: "卓越", note: "常规题几乎打满，复杂约束仍可能失手" };
  if (pct >= 70) return { name: "优秀", note: "标准推理稳定，难题拉开差距" };
  if (pct >= 50) return { name: "中等", note: "基础题可用，细节与最坏情况偏弱" };
  if (pct >= 30) return { name: "偏弱", note: "工作记忆与细抠能力不足" };
  return { name: "不足", note: "多数维度未达可用线" };
}

function dimStats(results: Record<string, ModelResult>) {
  const models = Object.keys(results);
  return QUESTIONS.dimensions.map((d) => {
    const units = UNITS.filter((u) => u.dim === d.id);
    const perModel = models.map((m) => {
      let got = 0;
      let max = 0;
      units.forEach((u) => {
        const it = results[m].items[u.id];
        if (!it) return;
        got += it.score;
        max += u.score;
      });
      return { model: m, got, max, pct: max ? Math.round((100 * got) / max) : 0 };
    });
    const max = perModel.reduce((s, x) => s + x.max, 0);
    const got = perModel.reduce((s, x) => s + x.got, 0);
    return { ...d, got, max, pct: max ? Math.round((100 * got) / max) : 0, perModel };
  });
}

export function buildReportHtml(
  results: Record<string, ModelResult>,
  meta: { baseUrl: string },
) {
  const models = Object.keys(results).sort((a, b) => {
    const ia = results[a].iq ?? modelIq(results[a].items).iq;
    const ib = results[b].iq ?? modelIq(results[b].items).iq;
    return ib - ia || results[b].total - results[a].total;
  });
  const now = new Date();
  const generatedAt = now.toLocaleString("zh-CN", { hour12: false });
  const host = hostOf(meta.baseUrl);
  const dims = dimStats(results);
  const avg = models.length
    ? models.reduce((s, m) => s + results[m].total, 0) / models.length
    : 0;
  const avgIq = models.length
    ? Math.round(
        models.reduce((s, m) => s + (results[m].iq ?? modelIq(results[m].items).iq), 0) /
          models.length,
      )
    : 70;
  const avgPct = MAX_SCORE ? Math.round((100 * avg) / MAX_SCORE) : 0;
  const band = rankLabel(avgPct);

  const ranking = models
    .map((m, i) => {
      const r = results[m];
      const pct = r.max ? Math.round((100 * r.total) / r.max) : 0;
      const b = rankLabel(pct);
      const n = Object.values(r.items).length;
      const pass = Object.values(r.items).filter((x) => x.ok).length;
      const iq = r.iq ?? modelIq(r.items).iq;
      const memo = Object.values(r.items).some((x) => x.memorized21);
      return `<tr>
        <td class="rank">${i + 1}</td>
        <td class="model">${esc(m)}</td>
        <td class="num">${iq}</td>
        <td class="num">${r.total}<span class="den">/${r.max}</span></td>
        <td class="num">${pct}%</td>
        <td><span class="pill">${esc(b.name)}${memo ? " · 背21" : ""}</span></td>
        <td class="num">${pass}/${n}</td>
        <td class="num">${r.seconds.toFixed(1)}s</td>
      </tr>`;
    })
    .join("");

  const dimCards = dims
    .map((d) => {
      return `<div class="dim">
        <div class="dim-top"><span>${esc(d.name)}</span><b>${d.pct}%</b></div>
        <div class="bar"><i style="width:${d.pct}%"></i></div>
      </div>`;
    })
    .join("");

  const heatHead = QUESTIONS.items
    .map((q) => `<th title="${esc(q.title)}">${esc(q.id)}</th>`)
    .join("");
  const heatRows = models
    .map((m) => {
      const cells = QUESTIONS.items
        .map((q) => {
          const it = results[m].items[q.id];
          if (!it) return `<td class="empty">—</td>`;
          const cls = it.ok ? "ok" : "bad";
          return `<td class="${cls}">${it.ok ? "●" : "○"} ${it.score}</td>`;
        })
        .join("");
      return `<tr><td class="model">${esc(m)}</td>${cells}<td class="num"><b>${results[m].total}</b></td></tr>`;
    })
    .join("");

  const modelChapters = models
    .map((m, i) => {
      const r = results[m];
      const pct = r.max ? Math.round((100 * r.total) / r.max) : 0;
      const b = rankLabel(pct);
      const rows = QUESTIONS.items
        .map((q) => {
          const it = r.items[q.id];
          if (!it) return "";
          const dim = QUESTIONS.dimensions.find((d) => d.id === q.dim)?.name ?? q.dim;
          const preview = esc((it.preview || "").slice(-900));
          const acc = it.accuracy ?? it.score;
          const spd = it.speedFactor ?? 1;
          const artSvg = q.id === "Q16" ? pelicanOf(it) : "";
          const art = artSvg
            ? `<div class="art">${artSvg.replace(/<script[\s\S]*?<\/script>/gi, "")}</div>`
            : "";
          return `<article class="q">
            <header>
              <div>
                <span class="qid">${esc(q.id)}</span>
                <h4>${esc(q.title)}</h4>
                <p class="meta">${esc(dim)} · ${it.seconds}s / 预算 ${q.timeBudget}s · 准${acc} × 速${spd.toFixed(2)} · ${it.ok ? "通过" : "未通过"}</p>
              </div>
              <div class="qscore ${it.ok ? "ok" : "bad"}">${it.score}<small>/${q.score}</small></div>
            </header>
            <p class="detail">${esc(it.detail)}</p>
            ${art}
            <pre>${preview || "（无输出）"}</pre>
          </article>`;
        })
        .join("");
      const probe = r.probe
        ? `<p class="probe">渠道鉴定（不计分）：${esc(probeLine(r.probe))}<br/>${r.probe.rows
            .map((row) => `${esc(row.quarter)}${row.ok ? "✓" : row.unsure ? "?" : "✗"}`)
            .join(" · ")}</p>`
        : "";
      const baseline = r.baseline
        ? `<p class="probe${r.baseline.suspect ? " suspect" : ""}">全网对照：${esc(
            baselineLine(r.iq ?? modelIq(r.items).iq, r.baseline),
          )}</p>`
        : "";
      return `<section class="chapter">
        <div class="ch-head">
          <span class="rank-lg">${String(i + 1).padStart(2, "0")}</span>
          <div>
            <h2>${esc(m)}</h2>
            <p>${r.total}/${r.max} 分 · ${pct}% · ${esc(b.name)} · 总耗时 ${r.seconds.toFixed(1)}s</p>
            ${probe}${baseline}
          </div>
        </div>
        ${rows}
      </section>`;
    })
    .join("");

  const gallery = models
    .map((m) => {
      const it = results[m].items.Q16 || results[m].items.Q16a;
      if (!it) return "";
      const inner = pelicanOf(it).replace(/<script[\s\S]*?<\/script>/gi, "");
      const extra = results[m].items.Q16a || results[m].items.Q16;
      return `<figure>
        <figcaption>${esc(m)} · ${extra?.score ?? it.score}/14 · ${esc(it.detail || extra?.detail || "")}</figcaption>
        <div class="frame">${inner || '<p class="empty">无 SVG</p>'}</div>
      </figure>`;
    })
    .join("");

  const bank = QUESTIONS.items
    .map((q) => {
      const dim = QUESTIONS.dimensions.find((d) => d.id === q.dim)?.name ?? q.dim;
      let ans = "";
      if (q.judge.type === "isolated_number") ans = q.expect;
      if (q.judge.type === "named") ans = q.expect;
      if (q.judge.type === "strict_json") ans = q.expect || JSON.stringify(q.judge.expect);
      if (q.judge.type === "pelican_html_svg") ans = "Q16a 作图 + Q16b 格式";
      return `<div class="bank">
        <h4>${esc(q.id)} ${esc(q.title)} <span>${esc(dim)} · ${q.score} 分</span></h4>
        <p class="prompt">${esc(q.prompt || q.expect)}</p>
        <p class="ans">评分依据：${esc(ans)}</p>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>猛蹬测评报告</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+SC:wght@500;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap");
  :root {
    --ink: #1c1812;
    --muted: #6b6256;
    --line: #d8cfc0;
    --paper: #f6f0e4;
    --card: #fffaf1;
    --gold: #b07d2a;
    --ok: #2f7a45;
    --bad: #b24532;
    --bar: #e7ddcc;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--paper); color: var(--ink);
    font-family: "Source Serif 4", "Noto Serif SC", Georgia, serif; line-height: 1.55; }
  .page { max-width: 880px; margin: 0 auto; padding: 48px 28px 80px; }
  header.cover { border-bottom: 1px solid var(--line); padding-bottom: 28px; margin-bottom: 36px; }
  .kicker { font-family: "IBM Plex Mono", monospace; letter-spacing: .18em; text-transform: uppercase;
    font-size: 11px; color: var(--gold); }
  h1 { font-size: 40px; margin: 10px 0 8px; letter-spacing: -0.03em; }
  .lede { color: var(--muted); max-width: 38em; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 22px; font-size: 13px; }
  .meta-row b { display: block; font-size: 18px; }
  .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 28px 0 40px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; }
  .stat .n { font-size: 42px; font-weight: 700; letter-spacing: -0.04em; }
  .stat .n small { font-size: 16px; color: var(--muted); font-weight: 500; }
  h2 { font-size: 24px; margin: 40px 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 600; padding: 8px 6px; border-bottom: 1px solid var(--line); }
  td { padding: 9px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  td.rank { font-family: "IBM Plex Mono", monospace; color: var(--gold); width: 36px; }
  td.model, th.model { font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; font-family: "IBM Plex Mono", monospace; font-size: 12px; }
  .den { color: var(--muted); }
  .pill { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; font-size: 12px; }
  .dims { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
  .dim-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
  .bar { height: 6px; background: var(--bar); border-radius: 99px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--gold); }
  .heat { overflow-x: auto; }
  td.ok { color: var(--ok); font-variant-numeric: tabular-nums; }
  td.bad { color: var(--bad); font-variant-numeric: tabular-nums; }
  td.empty { color: var(--muted); }
  .gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .frame { background: #d9eefc; border: 1px solid var(--line); border-radius: 12px; aspect-ratio: 4/3; overflow: hidden; }
  .frame svg { width: 100%; height: 100%; display: block; }
  .frame .empty { padding: 16px; color: var(--muted); }
  .chapter { break-inside: avoid; margin-top: 36px; }
  .ch-head { display: flex; gap: 14px; align-items: flex-start; border-top: 1px solid var(--ink); padding-top: 16px; }
  .rank-lg { font-family: "IBM Plex Mono", monospace; font-size: 28px; color: var(--gold); line-height: 1; }
  .ch-head h2 { margin: 0; }
  .ch-head p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .ch-head p.probe { font-size: 12px; line-height: 1.6; }
  .ch-head p.probe.suspect { color: var(--bad); font-weight: 600; }
  .q { margin-top: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
  .q header { display: flex; justify-content: space-between; gap: 12px; }
  .qid { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--gold); }
  .q h4 { margin: 2px 0 0; font-size: 16px; }
  .q .meta { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .qscore { font-size: 22px; font-weight: 700; }
  .qscore.ok { color: var(--ok); } .qscore.bad { color: var(--bad); }
  .qscore small { font-size: 12px; color: var(--muted); font-weight: 500; }
  .detail { font-size: 13px; color: var(--muted); margin: 8px 0; }
  .art { background: #fff; border-radius: 8px; padding: 8px; margin: 8px 0; }
  .art svg { width: 100%; max-height: 180px; }
  pre { white-space: pre-wrap; word-break: break-word; font-family: "IBM Plex Mono", monospace;
    font-size: 11px; background: #1c1812; color: #f3efe4; border-radius: 10px; padding: 10px 12px; max-height: 180px; overflow: auto; }
  .bank { border-top: 1px solid var(--line); padding: 14px 0; }
  .bank h4 { margin: 0 0 6px; }
  .bank h4 span { font-weight: 400; color: var(--muted); font-size: 13px; }
  .prompt { font-size: 13px; white-space: pre-wrap; }
  .ans { font-size: 12px; color: var(--gold); }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line);
    font-size: 12px; color: var(--muted); }
  .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px;
    padding: 10px 0 8px; background: linear-gradient(var(--paper), color-mix(in srgb, var(--paper) 80%, transparent)); }
  .toolbar button { font: inherit; border: 1px solid var(--line); background: var(--card); border-radius: 999px;
    padding: 8px 14px; cursor: pointer; }
  @media (max-width: 720px) {
    .hero, .dims, .gallery { grid-template-columns: 1fr; }
    h1 { font-size: 30px; }
    .page { padding: 24px 16px 56px; }
  }
  @media print {
    .toolbar { display: none; }
    body { background: white; }
    .page { max-width: none; padding: 0; }
    .q, .stat, .chapter { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="toolbar">
      <button onclick="window.print()">打印 / 存为 PDF</button>
    </div>
    <header class="cover">
      <div class="kicker">猛蹬 · 测模型会不会自己想</div>
      <h1>猛蹬测评报告</h1>
      <p class="lede">bench v7。测模型会不会自己想。IQ = 100 + 90×(加权通过率−0.5)。速度 1.5 倍时限内不扣卷面，3 倍才降到 0.88。差 <20 或区间重叠视为同档。半分不进 IQ。</p>
      <div class="meta-row">
        <div><span>生成时间</span><b>${esc(generatedAt)}</b></div>
        <div><span>接口主机</span><b>${esc(host)}</b></div>
        <div><span>模型数</span><b>${models.length}</b></div>
        <div><span>题量 / 满分</span><b>${QUESTIONS.items.length} / ${MAX_SCORE}</b></div>
      </div>
    </header>

    <div class="hero">
      <div class="stat">
        <div class="kicker">平均智商指数</div>
        <div class="n">${avgIq}<small> / 145</small></div>
        <p>${avgPct}% · 档位「${esc(band.name)}」<br>${esc(band.note)}</p>
      </div>
      <div class="stat">
        <div class="kicker">榜首</div>
        <div class="n">${models[0] ? esc(models[0]) : "—"}</div>
        <p>${models[0] ? `${results[models[0]].total}/${results[models[0]].max} · 耗时 ${results[models[0]].seconds.toFixed(1)}s` : "尚无成绩"}</p>
      </div>
    </div>

    <h2>总榜</h2>
    <table>
      <thead><tr><th>#</th><th>模型</th><th>IQ</th><th>得分</th><th>得分率</th><th>档位</th><th>通过题</th><th>耗时</th></tr></thead>
      <tbody>${ranking || `<tr><td colspan="7">没有可导出的成绩</td></tr>`}</tbody>
    </table>

    <h2>能力维度</h2>
    <div class="dims">${dimCards}</div>

    <h2>逐题对照</h2>
    <div class="heat">
      <table>
        <thead><tr><th>模型</th>${heatHead}<th>总分</th></tr></thead>
        <tbody>${heatRows}</tbody>
      </table>
    </div>

    <h2>鹈鹕骑自行车</h2>
    <p class="lede">Q16 须为手写 SVG 动画。下图是从作答里抽出的画面，用浏览器打开本报告即可看轮子和脚踏。</p>
    <div class="gallery">${gallery || "<p>本轮没有 Q16 结果</p>"}</div>

    ${modelChapters}

    <h2>题库与评分</h2>
    ${bank}

    <footer>
      猛蹬 · 主机 ${esc(host)} · ${esc(generatedAt)} · 评分在客户端完成，报告可离线打开。
    </footer>
  </div>
</body>
</html>`;
}

export function downloadReport(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `iq-bench-report-${stamp}.html`;
  a.click();
}

export { hostOf };

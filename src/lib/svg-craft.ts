/**
 * Q16 画工鉴定（不计分，不进 IQ）。
 * 权重思路来自 htbike/阿米 scorer v8：密度值钱、元素本身便宜、必须有上限防刷。
 * 不吸收他们的 SMIL 惩罚（咱们硬性要求轮子 SMIL）。
 * 「降智」只跟同模型历史画工比，不用他们那套 Grok 美术中位（会把简笔画合格卷打成降智）。
 */

export type SvgCraft = {
  score: number;
  commands: number;
  colors: number;
  elements: number;
  paths: number;
  anim: number;
  /** 同模型历史掉一半：真降智 */
  degraded: boolean;
  /** 结构能过、画面却像交白卷 */
  sparse: boolean;
  hits: string[];
  shrink?: string;
};

const W = {
  commands: 1,
  paths: 3,
  colors: 2.5,
  strokes: 1.5,
  elements: 0.4,
  groups: 0.4,
  nest: 2,
  gradients: 6,
  filters: 4,
  keyframes: 5,
  cssAnim: 4,
  smil: 3,
};

const CAP: Record<keyof typeof W, number> = {
  commands: 500,
  paths: 200,
  colors: 150,
  strokes: 50,
  elements: 200,
  groups: 200,
  nest: 30,
  gradients: 12,
  filters: 8,
  keyframes: 20,
  cssAnim: 20,
  smil: 16,
};

function countTag(svg: string, tag: string) {
  return (svg.match(new RegExp(`<\\s*${tag}\\b`, "gi")) || []).length;
}

function extractSvg(html: string) {
  const closed = html.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (closed) return closed[0];
  const open = html.match(/<svg\b[\s\S]*/i);
  return open ? open[0] : "";
}

function colorsIn(svg: string) {
  const set = new Set<string>();
  const add = (raw?: string) => {
    const c = (raw || "").trim().toLowerCase();
    if (!c || c === "none" || c === "transparent" || c === "currentcolor" || c.startsWith("url(")) return;
    set.add(c);
  };
  for (const m of svg.matchAll(/\b(?:fill|stroke|stop-color|flood-color|color)\s*=\s*["']([^"']+)["']/gi)) {
    add(m[1]);
  }
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color|color)\s*:\s*([^;}"']+)/gi)) {
    add(m[1]);
  }
  return set.size;
}

function pathStats(svg: string) {
  const ds = [...svg.matchAll(/\bd\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]);
  let commands = 0;
  for (const d of ds) commands += (d.match(/[mlhvcsqtaz]/gi) || []).length;
  return { paths: ds.filter((d) => d.trim()).length, commands, totalPathTags: countTag(svg, "path") };
}

function nestDepth(svg: string) {
  let depth = 0;
  let max = 0;
  for (const m of svg.matchAll(/<\/?([A-Za-z][\w:-]*)\b[^>]*\/?>/g)) {
    const tag = m[0];
    const name = m[1].toLowerCase();
    if (tag.startsWith("</")) depth = Math.max(0, depth - 1);
    else if (!tag.endsWith("/>") && name !== "path" && name !== "use") {
      depth += 1;
      if (depth > max) max = depth;
    }
  }
  return max;
}

export function scoreCraft(html: string, prior: number[] = []): SvgCraft {
  const svg = extractSvg(html || "");
  const hits: string[] = [];
  if (!svg) {
    return {
      score: 0,
      commands: 0,
      colors: 0,
      elements: 0,
      paths: 0,
      anim: 0,
      degraded: true,
      sparse: true,
      hits: ["无 SVG"],
    };
  }

  const style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ""])[1];
  const paths = pathStats(svg);
  const raw = {
    commands: paths.commands,
    paths: paths.paths,
    colors: colorsIn(svg + style),
    strokes: (svg.match(/\bstroke\s*=/gi) || []).length,
    elements: (svg.match(/<[A-Za-z]/g) || []).length,
    groups: countTag(svg, "g"),
    nest: nestDepth(svg),
    gradients: countTag(svg, "linearGradient") + countTag(svg, "radialGradient"),
    filters: countTag(svg, "filter"),
    keyframes: (style.match(/@keyframes\b/gi) || []).length,
    cssAnim: (style.match(/animation\s*:/gi) || []).length,
    smil:
      countTag(svg, "animate") +
      countTag(svg, "animateTransform") +
      countTag(svg, "animateMotion"),
  };

  if (paths.totalPathTags > 20 && paths.paths / paths.totalPathTags < 0.05) hits.push("空 path 刷分");
  if (raw.elements > 80 && raw.paths < 2 && raw.commands < 8) hits.push("元素多但几乎没画");
  if (/<script\b/i.test(html)) hits.push("内联脚本");
  if (/fonts\.googleapis|fonts\.gstatic|@import\s+url\(\s*['"]?https?:/i.test(html)) hits.push("外链字体");

  let score = 0;
  (Object.keys(W) as (keyof typeof W)[]).forEach((k) => {
    score += Math.min(raw[k], CAP[k]) * W[k];
  });
  score = Math.round(score);

  let shrink: string | undefined;
  if (prior.length >= 2) {
    const sorted = [...prior].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 0;
    if (med >= 40 && score < med * 0.5) {
      shrink = `画工 ${score} < 本模型历史中位 ${med} 的一半`;
      hits.push(shrink);
    }
  }

  const sparse =
    (raw.commands < 12 && raw.colors < 4 && raw.elements < 18) ||
    (raw.paths < 2 && raw.elements < 16);
  if (sparse) hits.push("结构能过但画面敷衍");

  return {
    score,
    commands: raw.commands,
    colors: raw.colors,
    elements: raw.elements,
    paths: raw.paths,
    anim: raw.smil + raw.cssAnim,
    degraded: Boolean(shrink),
    sparse,
    hits,
    shrink,
  };
}

export function craftLine(c?: SvgCraft) {
  if (!c) return "";
  const flag = c.degraded ? " · 画工缩水" : c.sparse ? " · 敷衍" : "";
  return `画工 ${c.score} · 复杂度 ${c.commands} · 颜色 ${c.colors} · 元素 ${c.elements}${flag}`;
}

export function priorCraftScores(
  model: string,
  runs: Array<{ models: Array<{ id: string; items: Record<string, { craft?: SvgCraft }> }> }>,
) {
  return runs
    .flatMap((run) => run.models.filter((m) => m.id === model))
    .map((m) => m.items.Q16?.craft?.score)
    .filter((n): n is number => typeof n === "number" && n > 0);
}

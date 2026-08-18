import type { LiveJudge, Question } from "./questions";

export type Judged = {
  ok: boolean;
  score: number;
  accuracy: number;
  speedFactor: number;
  detail: string;
  memorized21?: boolean;
  tags?: string[];
  incomplete?: boolean;
  svg?: string;
  html?: string;
  extra?: Record<string, Judged>;
};

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

export function cnToArabic(s: string) {
  return s.replace(/[零〇一二两三四五六七八九十百]+/g, (w) => {
    if (w === "十") return "10";
    let n = 0;
    let tmp = 0;
    for (const ch of w) {
      if (ch === "十") {
        n += (tmp || 1) * 10;
        tmp = 0;
      } else if (ch === "百") {
        n += (tmp || 1) * 100;
        tmp = 0;
      } else if (ch in CN_DIGIT) tmp = CN_DIGIT[ch];
    }
    return String(n + tmp);
  });
}

export function extractFinal(text: string) {
  if (!text) return "";
  const matches = text.match(/(?:最终答案|答案)[:：]\s*(.+)/g);
  let raw = "";
  if (matches?.length) {
    const last = matches[matches.length - 1]!;
    raw = last.replace(/^(?:最终答案|答案)[:：]\s*/, "").trim();
  } else {
    raw = text.slice(-400);
  }
  return cnToArabic(raw.replace(/[：]/g, ":").trim());
}

export function isolatedNumber(text: string, number: string) {
  const n = number.replace(".", "\\.");
  return new RegExp(`(?<!\\d)${n}(?!\\d)`).test(text);
}

/** 按数值而非字面匹配：兼容 0.1 / 0.10 / 12.0 等书写差异。 */
export function containsNumber(text: string, value: number | string) {
  const want = Number(value);
  if (!Number.isFinite(want)) return false;
  const tokens = text.match(/-?\d+(?:\.\d+)?/g) || [];
  return tokens.some((t) => Math.abs(Number(t) - want) < 1e-9);
}

function negated(focus: string, key: string) {
  return new RegExp(`(?:不|非|不是|并非|绝不)${key}`).test(focus);
}

function namedScore(
  name: string,
  full: string,
  hint?: string,
): { ok: boolean; detail: string; memorized21?: boolean; partial?: number; tags?: string[] } {
  const focus = extractFinal(full);
  if (name === "sleep") {
    const neg =
      /^(不|否|不必|无需|不要|不用|不应该)/.test(focus) ||
      /(不叫醒|不必叫醒|无需叫醒|不要叫醒|不用吃药|不必吃药|无需服药|不必服药|不给药|不要喂药|已经睡着|睡着了就不用|暂缓给药|暂不给药|持药观察)/.test(
        focus,
      );
    const forceWake =
      /(叫醒并|叫醒后|必须叫醒|应该叫醒|要叫醒|必须喂药|叫醒并喂)/.test(focus) && !/不/.test(focus);
    const ok = neg && !forceWake;
    return { ok, detail: ok ? "判定：不叫醒/不喂药" : "未压住「该喂药」的直觉" };
  }
  if (name === "wash") {
    const ok = /(开着?车|驾车|驾驶|自驾|把车开|开过去)/.test(focus);
    return { ok, detail: ok ? "判定：开车去" : "未点明开车把车送去洗" };
  }
  if (name === "colorblind") {
    const blob = focus + "\n" + full;
    const color = /(色盲|红绿|伴X|X隐|性染色体|色弱)/.test(blob);
    const paternity =
      /(不是亲生|并非亲生|不是他的亲生|不是生物学|非亲生|不是自己的孩子|不是自己女儿|不是他女儿|不是生父|不是生物学父亲|生物学上的父亲|不是其生父|非亲子|绿帽|出轨|不是他的种|不是自己骨肉|妻子外遇|不是他孩子)/.test(
        blob,
      );
    if (color && paternity) return { ok: true, detail: "串起色盲遗传与非亲生" };
    if (color) return { ok: false, partial: 0.5, detail: "遗传链完整但未推到亲子" };
    return { ok: false, detail: `缺环：遗传${color ? "✓" : "✗"} 亲子${paternity ? "✓" : "✗"}` };
  }
  if (name === "anchor") {
    const down = /下降|降低|下去/.test(focus);
    const reason = /(排水|浮力|体积|密度|重量排水|排开)/.test(focus + full);
    if (down && reason) return { ok: true, detail: "水位下降且理由正确" };
    if (down) return { ok: false, partial: 0.5, detail: "答下降但理由不足" };
    return { ok: false, detail: "未判定水位下降" };
  }
  if (name === "crt_money_classic") {
    const ok = containsNumber(focus, 0.05) || /(?<!\d)5\s*分/.test(focus) || /五\s*分/.test(focus);
    return { ok, detail: ok ? "抗直觉：0.05" : "可能答成了 0.10" };
  }
  if (name === "crt_money_var") {
    const want = hint || "";
    const ok = Boolean(want) && containsNumber(focus, want);
    const classic = containsNumber(focus, 0.05);
    return {
      ok,
      tags: !ok && classic ? ["背原题"] : undefined,
      detail: ok ? `命中 ${want}` : classic ? "答成经典题 0.05，疑似背原题" : `未命中 ${want}`,
    };
  }
  if (name === "knights") {
    const win = (hint || "丙").trim() || "丙";
    const letter: Record<string, string> = { 甲: "A", 乙: "B", 丙: "C" };
    const claims = (p: string) =>
      (new RegExp(`(骑士是${p}|${p}是骑士|${p}为骑士|只有${p}|仅${p})`).test(focus) ||
        new RegExp(`^[${p}${letter[p] || ""}]$`, "i").test(focus.trim())) &&
      !negated(focus, p);
    const negWin = new RegExp(`(?:不是|并非|非)${win}`).test(focus);
    const winHit =
      claims(win) || (new RegExp(`(?<![不非])是${win}`).test(focus) && !negWin);
    const others = ["甲", "乙", "丙"].filter((p) => p !== win);
    const ok = winHit && !negWin && others.every((p) => !claims(p));
    return { ok, detail: ok ? `骑士是${win}` : `未锁定${win}` };
  }
  if (name === "lineup") {
    const order = (hint || "戊丙丁甲乙").trim();
    const mid = order[2] || "丁";
    const others = ["甲", "乙", "丙", "丁", "戊"].filter((p) => p !== mid).join("");
    const midHit =
      new RegExp(
        `(中间是${mid}|中间为${mid}|${mid}在中间|第\\s*3\\s*[位个]是${mid}|第\\s*3\\s*[位个]为${mid}|3\\s*号是${mid})`,
      ).test(focus) ||
      new RegExp(`^${mid}$`).test(focus.trim()) ||
      new RegExp(order.split("").join("\\s*")).test(focus);
    const otherMid = new RegExp(`(中间是[${others}]|第\\s*3\\s*[位个]是[${others}])`).test(focus);
    const ok = midHit && !otherMid;
    return { ok, detail: ok ? `中间是${mid}` : `未定位${mid}` };
  }
  if (name === "candy_var") {
    if (containsNumber(focus, 17)) return { ok: true, detail: "按新表算出 17" };
    if (containsNumber(focus, 25)) {
      return { ok: false, partial: 0.5, tags: ["替代建模"], detail: "25 是盲取答案，半分" };
    }
    if (containsNumber(focus, 21)) {
      return { ok: false, tags: ["疑似套用经典答案"], detail: "答成 21，疑似套用经典题" };
    }
    return { ok: false, detail: "未命中 17" };
  }
  if (name === "candy_classic") {
    if (containsNumber(focus, 21)) return { ok: true, detail: "最优 21（9 圆 + 12 星）" };
    if (containsNumber(focus, 29)) {
      return { ok: false, partial: 0.5, tags: ["替代建模"], detail: "29 是盲取答案，半分" };
    }
    return { ok: false, detail: "未命中 21" };
  }
  if (name === "socks") {
    let ans = 0;
    let naive = 0;
    try {
      const o = JSON.parse(hint || "{}") as { ans?: number; naive?: number };
      ans = o.ans || 0;
      naive = o.naive || 0;
    } catch {
      /* ignore */
    }
    if (ans && containsNumber(focus, ans)) {
      return { ok: true, detail: `按实际库存最坏情况算出 ${ans}` };
    }
    if (naive && containsNumber(focus, naive)) {
      return {
        ok: false,
        partial: 0.5,
        tags: ["替代建模"],
        detail: `套用无限库存公式 ${naive}，半分`,
      };
    }
    return { ok: false, detail: `未命中 ${ans}` };
  }
  if (name === "analogy") {
    const want = (hint || "").trim();
    const ok = Boolean(want && focus.toUpperCase().includes(want.toUpperCase()));
    return { ok, detail: ok ? `命中 ${want}` : `未命中 ${want}` };
  }
  return { ok: false, detail: "未知 named 判分" };
}

function extractFence(text: string) {
  const fence = text.match(/```(?:html|svg|xml)?\s*([\s\S]*?)```/i);
  return fence ? fence[1] : text;
}

export function isGatewayJunk(text: string) {
  return /524:\s*A timeout|cf-error|cloudflare|upstream_saturated|并发上限|<!--\[if (?:lt )?IE/i.test(
    text || "",
  );
}

export function shortFail(text: string) {
  const s = (text || "").trim();
  if (!s) return "无作答";
  if (/524/.test(s)) return "网关 524 超时";
  if (/upstream_saturated|并发上限|饱和/.test(s)) return "上游饱和";
  if (/超时|timeout/i.test(s)) return "超时无产出";
  if (isGatewayJunk(s) || /<!DOCTYPE html|<html[\s>]/i.test(s)) return "网关错误页，不是 SVG";
  return s.replace(/\s+/g, " ").slice(0, 140);
}

export function extractSvg(text: string) {
  if (isGatewayJunk(text)) return "";
  const src = extractFence(text);
  const closed = src.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (closed) return closed[0];
  const open = src.match(/<svg\b[\s\S]*/i);
  return open ? `${open[0]}</svg>` : "";
}

export function extractHtml(text: string) {
  const src = extractFence(text);
  const start = src.search(/<!doctype html|<html[\s>]/i);
  if (start >= 0 && /<svg/i.test(src.slice(start)) && !isGatewayJunk(src)) return src.slice(start).trim();
  const svg = extractSvg(text);
  if (!svg) return "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${svg}</body></html>`;
}

export function gallerySrcDoc(html?: string, svg?: string) {
  const art = (svg && /<svg/i.test(svg) ? svg : "") || extractSvg(html || "") || extractSvg(svg || "");
  const css = `html,body{margin:0;width:100%;height:100%;background:#d9eefc;overflow:hidden}svg{width:100%;height:100%;display:block}`;
  if (art) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${art}</body></html>`;
  }
  if (html && /<svg/i.test(html)) return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
  return "";
}

export function speedFactor(seconds: number, budget: number) {
  const cap = Math.max(budget, 1);
  if (seconds <= cap * 1.5) return 1;
  const over = seconds / cap;
  if (over >= 3) return 0.88;
  return Number((1 - (over - 1.5) * (0.12 / 1.5)).toFixed(3));
}

function isRasterCheat(markup: string) {
  return (
    /<img\b/i.test(markup) ||
    /<canvas\b/i.test(markup) ||
    /data:image\//i.test(markup) ||
    /<image\b[^>]*(?:href|xlink:href)\s*=\s*["'](?:data:|https?:)/i.test(markup)
  );
}

function applyTimeBudget(
  accuracy: number,
  seconds: number,
  cap: number,
  notes: string[],
  passAt: number,
  factor: number,
): Judged {
  const score = Math.round(accuracy * factor);
  if (accuracy > 0) notes.push(`用时 ${seconds.toFixed(1)}s · 速度系数 ${factor.toFixed(2)}`);
  return {
    ok: score > 0 && accuracy >= passAt,
    score,
    accuracy,
    speedFactor: factor,
    detail: notes.join("；"),
  };
}

function timed(accuracy: number, seconds: number, item: Question, notes: string[], passAt?: number): Judged {
  const factor = accuracy <= 0 ? 0 : speedFactor(seconds, item.timeBudget);
  return applyTimeBudget(accuracy, seconds, item.score, notes, passAt ?? item.score, factor);
}

function attrNum(tag: string, name: string): number | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["'](-?[\\d.]+)`, "i"));
  return m ? Number(m[1]) : null;
}

function findById(svg: string, id: string): string | null {
  const re = new RegExp(`<([a-zA-Z]+)([^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)>`, "i");
  const m = svg.match(re);
  return m ? m[0] : null;
}

function subtreeById(svg: string, id: string): string {
  const re = new RegExp(`<([a-zA-Z][\\w:-]*)([^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)(/?)>`, "i");
  const m = re.exec(svg);
  if (!m || m.index == null) return "";
  const tag = m[1];
  const start = m.index;
  if (m[3] === "/" || /\/\s*>$/.test(m[0])) return svg.slice(start, Math.min(svg.length, start + 1800));
  let depth = 1;
  let i = start + m[0].length;
  while (i < svg.length && depth > 0) {
    const nextOpen = svg.slice(i).search(new RegExp(`<${tag}\\b`, "i"));
    const nextClose = svg.slice(i).search(new RegExp(`</${tag}\\s*>`, "i"));
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i += nextOpen + tag.length + 1;
    } else {
      depth -= 1;
      const close = svg.slice(i + nextClose).match(new RegExp(`^</${tag}\\s*>`, "i"));
      i += nextClose + (close ? close[0].length : tag.length + 3);
    }
  }
  return svg.slice(start, i);
}

function isRotateAnim(chunk: string) {
  return /<animateTransform\b[\s\S]{0,400}?\btype\s*=\s*["']rotate["']/i.test(chunk);
}

function hrefRotate(svg: string, id: string) {
  const re = new RegExp(
    `<animateTransform\\b[^>]*((href\\s*=\\s*["']#${id}["'][\\s\\S]{0,200}?type\\s*=\\s*["']rotate["'])|(type\\s*=\\s*["']rotate["'][\\s\\S]{0,200}?href\\s*=\\s*["']#${id}["']))`,
    "i",
  );
  return re.test(svg);
}

function wheelRotateScore(svg: string) {
  const front = isRotateAnim(subtreeById(svg, "wheel-front")) || hrefRotate(svg, "wheel-front");
  const rear = isRotateAnim(subtreeById(svg, "wheel-rear")) || hrefRotate(svg, "wheel-rear");
  if (front && rear) return { pts: 2, note: "双轮 rotate" };
  if (front || rear) return { pts: 1, note: "单轮 rotate" };
  const rotates = svg.match(/<animateTransform\b[\s\S]{0,300}?\btype\s*=\s*["']rotate["']/gi) || [];
  if (rotates.length >= 2) return { pts: 2, note: "父组/文档内双 rotate" };
  if (rotates.length === 1) return { pts: 1, note: "文档内一处 rotate" };
  if (/@keyframes[\s\S]{0,400}rotate|animation\s*:[^;]{0,80}(spin|rotate)/i.test(svg)) {
    return { pts: 1, note: "仅 CSS 旋转" };
  }
  return { pts: 0, note: "车轮未旋转" };
}

function parseViewBox(svg: string) {
  const m = svg.match(/viewBox\s*=\s*["']\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return { minX: 0, minY: 0, w: 400, h: 300 };
  return { minX: Number(m[1]), minY: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

const PELICAN_IDS = [
  "pelican-body",
  "pelican-beak",
  "pelican-pouch",
  "wheel-front",
  "wheel-rear",
  "chain",
  "pedal-left",
  "pedal-right",
  "foot-left",
  "foot-right",
];

function sanitizeSvgForMount(svg: string) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/((?:xlink:)?href\s*=\s*["'])\s*javascript:[^"']*/gi, "$1#");
}

type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };

type SvgProbe = {
  has: (id: string) => boolean;
  box: (id: string) => Box | null;
  contentBox: () => Box | null;
  wheelSpins: (id: string) => boolean;
  pedalBound: (ids: string[]) => boolean;
  hasAnyAnim: () => boolean;
  cleanup: () => void;
};

/** 把 SVG 挂进隐藏容器，用真实渲染几何（getBBox/getCTM）测量，SMIL 定格在 t=0。 */
function mountProbe(svgMarkup: string): SvgProbe | null {
  if (typeof document === "undefined" || !document.body) return null;
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-99999px;top:0;width:400px;height:300px;overflow:hidden;visibility:hidden;pointer-events:none";
  holder.innerHTML = sanitizeSvgForMount(svgMarkup);
  const root = holder.querySelector("svg");
  if (!root) return null;
  document.body.appendChild(holder);
  try {
    root.pauseAnimations();
    root.setCurrentTime(0);
  } catch {
    /* SMIL 不可用时按当前状态测量 */
  }
  const q = (id: string) => root.querySelector<SVGGraphicsElement>(`[id="${id}"]`);
  const toBox = (el: SVGGraphicsElement | null): Box | null => {
    if (!el) return null;
    try {
      const bb = el.getBBox();
      if (!(bb.width > 0) && !(bb.height > 0)) return null;
      const m = el.getCTM();
      const corners = [
        [bb.x, bb.y],
        [bb.x + bb.width, bb.y],
        [bb.x, bb.y + bb.height],
        [bb.x + bb.width, bb.y + bb.height],
      ].map(([x, y]) => (m ? { x: m.a * x! + m.c * y! + m.e, y: m.b * x! + m.d * y! + m.f } : { x: x!, y: y! }));
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    } catch {
      return null;
    }
  };
  const allAnims = (scope: Element) => [
    ...scope.querySelectorAll("animate, animateTransform, animateMotion"),
  ];
  const hrefOf = (el: Element) => {
    const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
    return href.startsWith("#") ? href.slice(1) : "";
  };
  const rotateTargets = new Set<string>();
  const animTargets = new Set<string>();
  for (const anim of allAnims(root)) {
    const target = hrefOf(anim);
    if (!target) continue;
    animTargets.add(target);
    if (
      anim.tagName.toLowerCase() === "animatetransform" &&
      (anim.getAttribute("type") || "").toLowerCase() === "rotate"
    ) {
      rotateTargets.add(target);
    }
  }
  const isRotate = (el: Element) =>
    el.tagName.toLowerCase() === "animatetransform" &&
    (el.getAttribute("type") || "").toLowerCase() === "rotate";
  const isAnim = (el: Element) => /^animate(transform|motion)?$/i.test(el.tagName);
  return {
    has: (id) => Boolean(q(id)),
    box: (id) => toBox(q(id)),
    contentBox: () => {
      try {
        const bb = root.getBBox();
        if (!(bb.width > 0) || !(bb.height > 0)) return null;
        return {
          x: bb.x,
          y: bb.y,
          w: bb.width,
          h: bb.height,
          cx: bb.x + bb.width / 2,
          cy: bb.y + bb.height / 2,
        };
      } catch {
        return null;
      }
    },
    wheelSpins: (id) => {
      const el = q(id);
      if (!el) return false;
      if (rotateTargets.has(id)) return true;
      if ([...el.querySelectorAll("animateTransform")].some(isRotate)) return true;
      // 旋转挂在包住这个轮子（且不包住另一个轮子）的父组上也算
      const other = id === "wheel-front" ? "wheel-rear" : "wheel-front";
      for (let p = el.parentElement; p && p !== (root as unknown as Element); p = p.parentElement) {
        if ([...p.children].some(isRotate) && !p.querySelector(`[id="${other}"]`)) return true;
      }
      return false;
    },
    pedalBound: (ids) => {
      for (const id of ids) {
        const el = q(id);
        if (!el) continue;
        if (animTargets.has(id) || allAnims(el).length) return true;
        // 曲柄组：包住脚/脚踏但不包住车轮的父组带动画也算
        for (let p = el.parentElement; p && p !== (root as unknown as Element); p = p.parentElement) {
          if (
            [...p.children].some(isAnim) &&
            !p.querySelector('[id="wheel-front"],[id="wheel-rear"]')
          ) {
            return true;
          }
        }
      }
      return false;
    },
    hasAnyAnim: () => allAnims(root).length > 0,
    cleanup: () => holder.remove(),
  };
}

type PelicanScore = {
  a: number;
  b: number;
  notesA: string[];
  notesB: string[];
  html: string;
  svg: string;
  geoTested: boolean;
};

function scorePelican(text: string): PelicanScore {
  const html = extractHtml(text);
  const svg = extractSvg(text);
  const zero = (why: string): PelicanScore => ({
    a: 0,
    b: 0,
    notesA: [why],
    notesB: [why],
    html,
    svg,
    geoTested: false,
  });
  if (!svg) return zero("没有内联 SVG");
  if (isRasterCheat(svg) || isRasterCheat(html)) return zero("位图/canvas，整题 0");

  const raw = svg;
  const notesA: string[] = [];
  const notesB: string[] = [];
  let a = 0;
  let b = 0;

  let probe: SvgProbe | null = null;
  try {
    probe = mountProbe(raw);
  } catch {
    probe = null;
  }

  // —— Q16b 指令遵循 ——
  const found = probe
    ? PELICAN_IDS.filter((id) => probe.has(id))
    : PELICAN_IDS.filter((id) => findById(raw, id));
  b += Math.floor((found.length / PELICAN_IDS.length) * 2);
  notesB.push(`id ${found.length}/9`);
  if (/viewBox\s*=\s*["']\s*0\s+0\s+400\s+300/.test(raw)) {
    b += 1;
    notesB.push("viewBox 400×300");
  } else notesB.push("viewBox 不是 0 0 400 300");
  if (/<!doctype html|<html[\s>]/i.test(extractFence(text))) {
    b += 1;
    notesB.push("完整 HTML");
  }

  // —— Q16a 空间作图 ——
  if (probe) {
    try {
      // 1. 车轮旋转 2 分
      const front = probe.wheelSpins("wheel-front");
      const rear = probe.wheelSpins("wheel-rear");
      if (front && rear) {
        a += 2;
        notesA.push("双轮 rotate");
      } else if (front || rear) {
        a += 1;
        notesA.push("单轮 rotate");
      } else notesA.push("车轮未旋转");

      // 2. 踩踏动画 2 分
      if (probe.pedalBound(["pedal-left", "pedal-right", "foot-left", "foot-right"])) {
        a += 2;
        notesA.push("踩踏动画");
      } else if (probe.hasAnyAnim()) {
        a += 1;
        notesA.push("文档有动画，脚踏未绑定");
      } else notesA.push("没有动画");

      // 3. 脚贴脚踏 2 分（真实渲染坐标，含任意 transform）
      const wheelBox = probe.box("wheel-rear") || probe.box("wheel-front");
      const radius = wheelBox ? Math.max(wheelBox.w, wheelBox.h) / 2 : 20;
      let planted = 0;
      for (const [f, p] of [
        ["foot-left", "pedal-left"],
        ["foot-right", "pedal-right"],
      ] as const) {
        const fb = probe.box(f);
        const pb = probe.box(p);
        if (fb && pb && Math.hypot(fb.cx - pb.cx, fb.cy - pb.cy) <= radius * 0.4) planted++;
      }
      if (planted === 2) {
        a += 2;
        notesA.push("双脚踩踏");
      } else if (planted === 1) {
        a += 1;
        notesA.push("单脚踩踏");
      } else notesA.push("脚不在脚踏上");

      // 4. 画面内 2 分（整体包围盒与 viewBox 求交，容差 8px 颠簸）
      const vb = parseViewBox(raw);
      const cb = probe.contentBox();
      if (cb) {
        const pad = 8;
        const ix =
          Math.max(0, Math.min(cb.x + cb.w, vb.minX + vb.w + pad) - Math.max(cb.x, vb.minX - pad));
        const iy =
          Math.max(0, Math.min(cb.y + cb.h, vb.minY + vb.h + pad) - Math.max(cb.y, vb.minY - pad));
        const frac = (ix * iy) / (cb.w * cb.h);
        if (frac >= 0.98) {
          a += 2;
          notesA.push("画面内");
        } else if (frac >= 0.85) {
          a += 1;
          notesA.push(`小幅出框（${Math.round(frac * 100)}% 在框内）`);
        } else notesA.push(`大幅出框（${Math.round(frac * 100)}% 在框内）`);
      } else notesA.push("无可渲染图形");

      // 5. 鹈鹕形态 2 分（长扁喙 / 喉囊在喙下 / 身体占比）
      const body = probe.box("pelican-body");
      const beak = probe.box("pelican-beak");
      const pouch = probe.box("pelican-pouch");
      const beakLong = Boolean(beak && beak.w >= beak.h * 1.4);
      const pouchBelow = Boolean(
        beak && pouch && pouch.cy >= beak.cy && Math.abs(pouch.cx - beak.cx) <= beak.w + pouch.w,
      );
      const bodyBig = Boolean(body && beak && body.w * body.h >= beak.w * beak.h * 1.5);
      const morphHits = [beakLong, pouchBelow, bodyBig].filter(Boolean).length;
      if (morphHits === 3) {
        a += 2;
        notesA.push("鹈鹕形态（长扁喙/喉囊/身形）");
      } else if (morphHits === 2) {
        a += 1;
        notesA.push("形态部分达标");
      } else notesA.push("形态不像鹈鹕");

      return { a: Math.min(10, a), b: Math.min(4, b), notesA, notesB, html, svg, geoTested: true };
    } finally {
      probe.cleanup();
    }
  }

  // —— 回退：无 DOM 环境时的静态结构判分（几何未测，满分 8，通过线 6）——
  const wr = wheelRotateScore(raw);
  a += wr.pts;
  notesA.push(wr.note);

  const pedalChunk = ["pedal-left", "pedal-right", "foot-left", "foot-right"]
    .map((id) => subtreeById(raw, id))
    .join("\n");
  if (/<animate(transform|motion)?\b/i.test(pedalChunk)) {
    a += 2;
    notesA.push("踩踏动画");
  } else if (/<animate(transform|motion)?\b/i.test(raw)) {
    a += 1;
    notesA.push("文档有动画，脚踏未绑定");
  } else {
    notesA.push("脚踏动画不足");
  }
  notesA.push("几何未测（无渲染环境）");

  const fly = /translate\(\s*-?[4-9]\d{2,}/i.test(raw);
  if (!fly) {
    a += 2;
    notesA.push("画面内");
  } else notesA.push("位移过大");

  const beak = findById(raw, "pelican-beak");
  const pouch = findById(raw, "pelican-pouch");
  const bodyEl = findById(raw, "pelican-body");
  let morph = Boolean(beak && pouch && bodyEl);
  if (beak) {
    const bw = attrNum(beak, "width") ?? attrNum(beak, "rx");
    const bh = attrNum(beak, "height") ?? attrNum(beak, "ry");
    if (bw != null && bh != null && bw < bh * 1.2) morph = false;
  }
  if (morph) {
    a += 2;
    notesA.push("鹈鹕形态");
  } else notesA.push("形态不像鹈鹕");

  return { a: Math.min(10, a), b: Math.min(4, b), notesA, notesB, html, svg, geoTested: false };
}

function parseJsonObjects(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const v = JSON.parse(text.slice(i, j + 1)) as unknown;
            if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as Record<string, unknown>);
          } catch {
            /* skip */
          }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

function pickJson(content: string): { obj: Record<string, unknown> | null; extra: boolean } {
  const focus = extractFinal(content);
  const fromFocus = parseJsonObjects(focus);
  const all = parseJsonObjects(content);
  const obj = fromFocus[fromFocus.length - 1] || all[all.length - 1] || all[0] || null;
  const leftover = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/(?:最终答案|答案)\s*[:：]\s*/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/[,:：.\s]/g, "");
  return { obj, extra: leftover.length > 0 };
}

function accuracyOf(judge: LiveJudge, item: Question, content: string) {
  if (judge.type === "isolated_number") {
    const focus = extractFinal(content);
    const ok = containsNumber(focus, judge.value);
    return {
      accuracy: ok ? item.score : 0,
      detail: ok ? `最终答案命中 ${judge.value}` : `不是 ${judge.value}`,
    };
  }
  if (judge.type === "named") {
    const r = namedScore(judge.name, content, (judge as LiveJudge).expectHint);
    return {
      accuracy: r.ok ? item.score : Math.round(item.score * (r.partial ?? 0)),
      detail: r.detail,
      memorized21: r.memorized21,
      tags: r.tags,
    };
  }
  if (judge.type === "strict_json") {
    const { obj, extra } = pickJson(content);
    if (!obj) return { accuracy: 0, detail: "不是合法 JSON" };
    const keys = Object.keys(judge.expect);
    const fields = keys.filter((k) => obj[k] === judge.expect[k]).length;
    const matched = fields === keys.length;
    const acc = matched && !extra ? item.score : matched ? item.score - 1 : Math.min(3, fields);
    return {
      accuracy: Math.max(0, acc),
      detail: extra && matched ? "JSON 正确但有夹带" : `字段 ${fields}/${keys.length}`,
    };
  }
  return { accuracy: 0, detail: "未知判分" };
}

export function judgeItem(
  item: Question,
  content: string,
  seconds = 0,
  judge: LiveJudge = item.judge,
): Judged {
  if (judge.type === "pelican_html_svg") {
    const r = scorePelican(content);
    const factor = content ? speedFactor(seconds, item.timeBudget) : 0;
    const passA = r.geoTested ? 7 : 6;
    const a = applyTimeBudget(r.a, seconds, 10, [...r.notesA], passA, r.a ? factor : 0);
    const b = applyTimeBudget(r.b, seconds, 4, [...r.notesB], 4, r.b ? factor : 0);
    if (!r.geoTested) a.tags = ["几何未测"];
    const combined = timed(r.a + r.b, seconds, item, [...r.notesA, ...r.notesB], 14);
    combined.ok = a.ok && b.ok;
    return {
      ...combined,
      svg: r.svg,
      html: r.html,
      extra: { Q16a: a, Q16b: b },
    };
  }
  const base = accuracyOf(judge, item, content);
  const judged = timed(base.accuracy, seconds, item, base.detail ? [base.detail] : []);
  return { ...judged, memorized21: base.memorized21, tags: base.tags };
}

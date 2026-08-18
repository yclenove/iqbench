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
    const ok = /(开车|驾车|把车开|开过去)/.test(focus);
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
    const ok =
      isolatedNumber(focus, "0.05") ||
      isolatedNumber(focus, "0.050") ||
      /(?<!\d)5\s*分/.test(focus) ||
      /五\s*分/.test(focus);
    return { ok, detail: ok ? "抗直觉：0.05" : "可能答成了 0.10" };
  }
  if (name === "crt_money_var") {
    const want = hint || "";
    const ok = Boolean(
      want && (isolatedNumber(focus, want) || isolatedNumber(focus, Number(want).toString())),
    );
    const classic = isolatedNumber(focus, "0.05");
    return {
      ok,
      tags: !ok && classic ? ["背原题"] : undefined,
      detail: ok ? `命中 ${want}` : classic ? "答成经典题 0.05，疑似背原题" : `未命中 ${want}`,
    };
  }
  if (name === "knights") {
    const jiaKnight = /(骑士是甲|甲是骑士|甲为骑士)/.test(focus);
    const yiKnight = /(骑士是乙|乙是骑士|乙为骑士)/.test(focus);
    const bingKnight =
      ((/(骑士是丙|丙是骑士|丙为骑士|只有丙|仅丙)/.test(focus) || /^[丙C]$/i.test(focus.trim())) &&
        !negated(focus, "丙")) ||
      (/(?<![不非])是丙/.test(focus) && !/不是丙|非丙/.test(focus));
    const ok = Boolean(bingKnight) && !jiaKnight && !yiKnight && !/不是丙|非丙/.test(focus);
    return { ok, detail: ok ? "骑士是丙" : "未锁定丙" };
  }
  if (name === "lineup") {
    const dingMid =
      /(中间是丁|中间为丁|丁在中间|第\s*3\s*[位个]是丁|第\s*3\s*[位个]为丁|3\s*号是丁)/.test(focus) ||
      /^丁$/.test(focus.trim()) ||
      /戊\s*丙\s*丁\s*甲\s*乙/.test(focus);
    const otherMid = /(中间是[甲乙丙戊]|第\s*3\s*[位个]是[甲乙丙戊])/.test(focus);
    const ok = dingMid && !otherMid;
    return { ok, detail: ok ? "中间是丁" : "未定位丁" };
  }
  if (name === "candy_var") {
    if (isolatedNumber(focus, "17")) return { ok: true, detail: "按新表算出 17" };
    if (isolatedNumber(focus, "25")) {
      return { ok: false, partial: 0.5, tags: ["替代建模"], detail: "25 是盲取答案，半分" };
    }
    if (isolatedNumber(focus, "21")) {
      return { ok: false, tags: ["疑似套用经典答案"], detail: "答成 21，疑似套用经典题" };
    }
    return { ok: false, detail: "未命中 17" };
  }
  if (name === "candy_classic") {
    if (isolatedNumber(focus, "21")) return { ok: true, detail: "最优 21（9 圆 + 12 星）" };
    if (isolatedNumber(focus, "29")) {
      return { ok: false, partial: 0.5, tags: ["替代建模"], detail: "29 是盲取答案，半分" };
    }
    return { ok: false, detail: "未命中 21" };
  }
  if (name === "candy_param") {
    let shape = 0;
    let blind = 0;
    try {
      const o = JSON.parse(hint || "{}") as { shape?: number; blind?: number };
      shape = o.shape || 0;
      blind = o.blind || 0;
    } catch {
      /* ignore */
    }
    if (shape && isolatedNumber(focus, String(shape))) {
      return { ok: true, detail: `形状模型最优 ${shape}` };
    }
    if (blind && isolatedNumber(focus, String(blind))) {
      return { ok: false, partial: 0.5, tags: ["替代建模"], detail: `盲取 ${blind}，半分` };
    }
    return { ok: false, detail: `未命中 ${shape}` };
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

export function extractSvg(text: string) {
  const src = extractFence(text);
  const closed = src.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (closed) return closed[0];
  const open = src.match(/<svg\b[\s\S]*/i);
  return open ? `${open[0]}</svg>` : "";
}

export function extractHtml(text: string) {
  const src = extractFence(text);
  const start = src.search(/<!doctype html|<html[\s>]/i);
  if (start >= 0 && /<svg/i.test(src.slice(start))) return src.slice(start).trim();
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
  if (seconds <= budget) return 1;
  const over = seconds / Math.max(budget, 1);
  if (over >= 3) return 0.55;
  return Number((1 - (over - 1) * (0.45 / 2)).toFixed(3));
}

function isRasterCheat(markup: string) {
  return (
    /<img\b/i.test(markup) ||
    /<canvas\b/i.test(markup) ||
    /data:image\//i.test(markup) ||
    /<image\b[^>]*(?:href|xlink:href)\s*=\s*["'](?:data:|https?:)/i.test(markup)
  );
}

function applyTime(
  accuracy: number,
  seconds: number,
  cap: number,
  notes: string[],
  passAt: number,
): Judged {
  const factor = accuracy <= 0 ? 0 : speedFactor(seconds, 1) ? speedFactor(seconds, 1) : 0;
  return applyTimeBudget(accuracy, seconds, cap, notes, passAt, factor);
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

function centerOf(tag: string): { x: number; y: number } | null {
  const cx = attrNum(tag, "cx") ?? attrNum(tag, "x");
  const cy = attrNum(tag, "cy") ?? attrNum(tag, "y");
  if (cx != null && cy != null) return { x: cx, y: cy };
  const t = tag.match(/translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/);
  if (t) return { x: Number(t[1]), y: Number(t[2]) };
  return null;
}

function parseViewBox(svg: string) {
  const m = svg.match(/viewBox\s*=\s*["']\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return { minX: 0, minY: 0, w: 400, h: 300 };
  return { minX: Number(m[1]), minY: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

function scorePelican(text: string) {
  const html = extractHtml(text);
  const svg = extractSvg(text);
  const notesA: string[] = [];
  const notesB: string[] = [];
  if (!svg) {
    const zero = {
      a: 0,
      b: 0,
      notesA: ["没有内联 SVG"],
      notesB: ["没有内联 SVG"],
      html: "",
      svg: "",
      skipGeo: false,
    };
    return zero;
  }
  const raw = svg;
  if (isRasterCheat(svg) || isRasterCheat(html)) {
    return { a: 0, b: 0, notesA: ["位图/canvas，整题 0"], notesB: ["位图/canvas，整题 0"], html, svg, skipGeo: false };
  }

  let a = 0;
  let b = 0;
  const required = [
    "pelican-body",
    "pelican-beak",
    "pelican-pouch",
    "wheel-front",
    "wheel-rear",
    "pedal-left",
    "pedal-right",
    "foot-left",
    "foot-right",
  ];
  const found = required.filter((id) => findById(raw, id));
  b += Math.floor((found.length / required.length) * 2);
  notesB.push(`id ${found.length}/9`);
  if (/viewBox\s*=\s*["']\s*0\s+0\s+400\s+300/.test(raw)) {
    b += 1;
    notesB.push("viewBox 400×300");
  } else notesB.push("viewBox 不是 0 0 400 300");
  if (/<!doctype html|<html[\s>]/i.test(extractFence(text))) {
    b += 1;
    notesB.push("完整 HTML");
  }

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

  const grouped = /<g\b[^>]*transform/i.test(raw);
  let skipGeo = grouped;
  if (!grouped) {
    const wheelEl = findById(raw, "wheel-rear") || findById(raw, "wheel-front");
    const radius = wheelEl ? (attrNum(wheelEl, "r") ?? 16) : 18;
    let planted = 0;
    for (const [f, p] of [
      ["foot-left", "pedal-left"],
      ["foot-right", "pedal-right"],
    ] as const) {
      const ft = findById(raw, f);
      const pd = findById(raw, p);
      if (!ft || !pd) continue;
      const fc = centerOf(ft);
      const pc = centerOf(pd);
      if (fc && pc && Math.hypot(fc.x - pc.x, fc.y - pc.y) <= radius * 0.4) planted++;
    }
    if (planted === 2) {
      a += 2;
      notesA.push("双脚踩踏");
    } else if (planted === 1) {
      a += 1;
      notesA.push("单脚踩踏");
    } else notesA.push("脚不在脚踏上");
  } else {
    notesA.push("几何未测（含 g transform）");
  }

  const vb = parseViewBox(raw);
  const fly = /translate\(\s*-?[4-9]\d{2,}/i.test(raw);
  if (!fly) {
    a += 2;
    notesA.push("画面内");
  } else notesA.push("位移过大");

  const beak = findById(raw, "pelican-beak");
  const pouch = findById(raw, "pelican-pouch");
  const body = findById(raw, "pelican-body");
  let morph = Boolean(beak && pouch && body);
  if (beak) {
    const bw = attrNum(beak, "width") ?? attrNum(beak, "rx");
    const bh = attrNum(beak, "height") ?? attrNum(beak, "ry");
    if (bw != null && bh != null && bw < bh * 1.2) morph = false;
  }
  if (morph) {
    a += 2;
    notesA.push("鹈鹕形态");
  } else notesA.push("形态不像鹈鹕");

  return { a: Math.min(10, a), b: Math.min(4, b), notesA, notesB, html, svg, skipGeo };
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
    const ok = isolatedNumber(focus, judge.value);
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
    const passA = r.skipGeo ? 6 : 7;
    const a = applyTimeBudget(r.a, seconds, 10, r.notesA, passA, r.a ? factor : 0);
    const b = applyTimeBudget(r.b, seconds, 4, r.notesB, 4, r.b ? factor : 0);
    if (r.skipGeo) a.tags = ["几何未测"];
    return {
      ...timed(r.a + r.b, seconds, item, [...r.notesA, ...r.notesB], 14),
      svg: r.svg,
      html: r.html,
      extra: { Q16a: a, Q16b: b },
    };
  }
  const base = accuracyOf(judge, item, content);
  const judged = timed(base.accuracy, seconds, item, base.detail ? [base.detail] : []);
  return { ...judged, memorized21: base.memorized21, tags: base.tags };
}

export function failIncomplete(item: Question, detail: string, tag = "超预算无产出"): Judged {
  return {
    ok: false,
    score: 0,
    accuracy: 0,
    speedFactor: 0,
    detail,
    tags: [tag],
    incomplete: tag !== "超预算无产出",
  };
}

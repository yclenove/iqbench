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

/** 渠道常把答案包在 Markdown 里：加粗、标题、引用、行内代码、HTML 标签。 */
export function unwrapMarkdown(s: string) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/```[\w-]*\n?/g, "")
    .replace(/`+/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/<\/?(?:strong|b|em|i|p|br|span|div|code|pre|h[1-6]|blockquote)[^>]*>/gi, " ")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/&/gi, "&")
    .replace(/[ \t]+\n/g, "\n");
}

export function extractSlot(text: string): { found: boolean; line: string } {
  const plain = unwrapMarkdown(text || "");
  const lines = plain.split(/\n/);
  let last = "";
  let found = false;
  const head =
    /^(?:最终答案|最后答案|本题答案|final\s*answer|the\s+answer\s+is|answer\s+is)\s*[:：是为]?\s*(.*)$/i;
  const alt = /^(?:答案)\s*[:：是]\s*(.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const m = line.match(head) || line.match(alt);
    if (!m) continue;
    found = true;
    let val = (m[1] || "").trim().replace(/^[\s*#:：-]+/, "").replace(/[*`]+$/g, "");
    if (!val) val = (lines[i + 1] || "").trim();
    last = val;
  }
  if (!found) {
    const loose = [
      ...plain.matchAll(
        /(?:最终答案|最后答案|本题答案|final\s*answer|the\s+answer\s+is|answer\s+is)\s*[:：是为]?\s*([^\n]+)/gi,
      ),
    ];
    if (loose.length) {
      found = true;
      last = loose[loose.length - 1]![1]!.trim();
    }
  }
  const line = cnToArabic((found ? last : plain.slice(-800)).replace(/[：]/g, ":").trim());
  return { found, line };
}

export function extractFinal(text: string) {
  return extractSlot(text).line;
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

function dequote(s: string) {
  return s
    .replace(/[“”「」『』]/g, '"')
    .replace(/"[^"]*"/g, " ")
    .replace(/若[甲乙丙].{0,8}是骑士/g, " ");
}

function firstOf(s: string, set: string) {
  const m = s.match(new RegExp(`[${set}]`));
  return m?.[0] || "";
}

function namedScore(
  name: string,
  full: string,
  hint?: string,
): { ok: boolean; detail: string; memorized21?: boolean; partial?: number; tags?: string[] } {
  const slot = extractSlot(full);
  const focus = slot.line;
  const body = unwrapMarkdown(full);
  if (name === "sleep") {
    const blob = focus || full.slice(-400);
    const withhold =
      /不(?:必|需|要|用|应|该)?(?:该)?(?:立即|马上|此刻|现在|当场)?(?:给药|喂药|服药|吃药|发药)/.test(blob) ||
      /不(?:必|需|要|用|应|该)?(?:该)?(?:叫醒|唤醒)/.test(blob) ||
      /^(不|否|不必|无需|不要|不用|不应该)/.test(blob) ||
      /(已经睡着|睡着了就不用|暂缓给药|暂不给药|持药观察|等(?:他|她|其|病人|患者)?醒)/.test(blob);
    const forceWake =
      /(叫醒并|叫醒后|必须叫醒|应该叫醒|要叫醒|必须喂药|叫醒并喂)/.test(blob) && !/不/.test(blob);
    const ok = withhold && !forceWake;
    return { ok, detail: ok ? "判定：不叫醒/不喂药" : "未压住「该喂药」的直觉" };
  }
  if (name === "wash") {
    const blob = focus || full.slice(-400);
    const walk = /(步行|走路|走去|走着去|打车|出租车|公交|地铁|骑车|骑单车|骑自行车)/.test(blob);
    const drive =
      /(开着?车|开着?.{0,24}(?:轿车|车去)|驾车|驾驶|自驾|把车开|开过去|开自己(?:的|那辆)?车)/.test(blob);
    const ok = drive && !walk;
    return { ok, detail: ok ? "判定：开车去" : "未点明开车把车送去洗" };
  }
  if (name === "colorblind") {
    const blob = `${focus}\n${body || full}`;
    const color =
      /(色盲|红绿|伴X|X隐|性染色体|色弱|color\s*blind|colour\s*blind|red-?green|x-?linked)/i.test(
        blob,
      );
    const paternity =
      /(不是亲生|并非亲生|不是他的亲生|不是生物学|非亲生|不是自己的孩子|不是自己女儿|不是他女儿|不是生父|不是生物学父亲|生物学上的父亲|不是其生父|非亲子|绿帽|出轨|不是他的种|不是自己骨肉|妻子外遇|不是他孩子|not (?:his|the) (?:biological )?(?:daughter|child|father)|affair|paternity|cuckold)/i.test(
        blob,
      );
    if (color && paternity) return { ok: true, detail: "串起色盲遗传与非亲生" };
    if (color) return { ok: false, partial: 0.5, detail: "遗传链完整但未推到亲子" };
    return { ok: false, detail: `缺环：遗传${color ? "✓" : "✗"} 亲子${paternity ? "✓" : "✗"}` };
  }
  if (name === "anchor") {
    const down = /下降|降低|下去/.test(focus);
    const reason = /(排水|浮力|体积|密度|重量排水|排开)/.test(focus + "\n" + body);
    if (down && reason) return { ok: true, detail: "水位下降且理由正确" };
    if (down) return { ok: false, partial: 0.5, detail: "答下降但理由不足" };
    return { ok: false, detail: "未判定水位下降" };
  }
  if (name === "crt_money_classic") {
    const blob = slot.found ? focus : body;
    const ok = containsNumber(blob, 0.05) || /(?<!\d)5\s*分/.test(blob) || /五\s*分/.test(blob);
    return { ok, detail: ok ? "抗直觉：0.05" : "可能答成了 0.10" };
  }
  if (name === "crt_money_var") {
    const want = hint || "";
    const blob = slot.found ? focus : body;
    const ok = Boolean(want) && containsNumber(blob, want);
    const classic = containsNumber(blob, 0.05);
    return {
      ok,
      tags: !ok && classic ? ["背原题"] : undefined,
      detail: ok ? `命中 ${want}` : classic ? "答成经典题 0.05，疑似背原题" : `未命中 ${want}`,
    };
  }
  if (name === "knights") {
    const win = (hint || "丙").trim() || "丙";
    if (slot.found) {
      const p = firstOf(focus, "甲乙丙");
      return { ok: p === win, detail: p === win ? `骑士是${win}` : `槽写了${p || focus.slice(0, 12)}，应对${win}` };
    }
    const blob = dequote(body);
    const head = blob.trim().split(/[\n。！？]/)[0] || "";
    const claims = (p: string) =>
      new RegExp(`(骑士是${p}|${p}是骑士|${p}为骑士|只有${p}|仅${p})`).test(blob) && !negated(blob, p);
    const headWin = new RegExp(`(骑士是${win}|${win}是骑士|^\\s*${win}\\s*$)`).test(head);
    const others = ["甲", "乙", "丙"].filter((p) => p !== win);
    const otherHead = others.some((p) => new RegExp(`${p}是骑士|骑士是${p}`).test(head));
    const ok = (headWin || claims(win)) && !negated(blob, win) && !otherHead && others.every((p) => !claims(p));
    return { ok, detail: ok ? `骑士是${win}` : `未锁定${win}` };
  }
  if (name === "lineup") {
    const order = (hint || "戊丙丁甲乙").trim();
    const mid = order[2] || "丁";
    if (slot.found) {
      const p = firstOf(focus, "甲乙丙丁戊");
      return { ok: p === mid, detail: p === mid ? `中间是${mid}` : `槽写了${p || focus.slice(0, 12)}，应对${mid}` };
    }
    const others = ["甲", "乙", "丙", "丁", "戊"].filter((p) => p !== mid);
    const blob = body;
    const midHit =
      new RegExp(
        `(中间.{0,12}是[:：*\\s]*${mid}|${mid}.{0,8}在中间|第\\s*3\\s*[位个号].{0,12}是[:：*\\s]*${mid}|站在中间.{0,16}${mid}|3\\s*号是${mid})`,
      ).test(blob) ||
      new RegExp(`^\\s*${mid}\\s*$`).test(blob.trim()) ||
      new RegExp(order.split("").join("\\s*")).test(blob);
    const otherMid = new RegExp(
      `(中间.{0,12}是[:：*\\s]*[${others.join("")}]|第\\s*3\\s*[位个号].{0,12}是[:：*\\s]*[${others.join("")}])`,
    ).test(blob);
    const ok = midHit && !otherMid;
    return { ok, detail: ok ? `中间是${mid}` : `未定位${mid}` };
  }
  if (name === "candy_var") {
    const tail = body.slice(-2000);
    const hit = (s: string) =>
      containsNumber(s, 17) ||
      /十七/.test(s) ||
      /(?:7\s*[+＋加]\s*10|10\s*[+＋加]\s*7)/.test(s) ||
      /(?:7\s*圆.{0,16}10\s*星|10\s*星.{0,16}7\s*圆)/.test(s);
    if ((slot.found && hit(focus) && !negated(focus, "17")) || (hit(tail) && !negated(tail, "17"))) {
      return { ok: true, detail: "按新表算出 17" };
    }
    if ((slot.found && containsNumber(focus, 25)) || containsNumber(tail, 25)) {
      return { ok: false, partial: 0.5, tags: ["替代建模"], detail: "25 是盲取答案，半分" };
    }
    if ((slot.found && containsNumber(focus, 21)) || containsNumber(tail, 21)) {
      return { ok: false, tags: ["疑似套用经典答案"], detail: "答成 21，疑似套用经典题" };
    }
    return { ok: false, detail: "未命中 17" };
  }
  if (name === "candy_classic") {
    const tail = body.slice(-2000);
    if ((slot.found && containsNumber(focus, 21)) || containsNumber(tail, 21)) {
      return { ok: true, detail: "最优 21（9 圆 + 12 星）" };
    }
    if ((slot.found && containsNumber(focus, 29)) || containsNumber(tail, 29)) {
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
    const blob = slot.found ? focus : body;
    if (ans && containsNumber(blob, ans)) {
      return { ok: true, detail: `按实际库存最坏情况算出 ${ans}` };
    }
    if (naive && containsNumber(blob, naive)) {
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
  if (/HTTP\s*502|Bad Gateway/i.test(s)) return "渠道 502（网关挂了，不是模型答错）";
  if (/HTTP\s*503|Service Unavailable/i.test(s)) return "渠道 503（上游不可用）";
  if (/524/.test(s)) return "网关 524 超时";
  if (/HTTP\s*504|Gateway Timeout/i.test(s)) return "渠道 504 超时";
  if (/upstream_saturated|并发上限|饱和/.test(s)) return "上游饱和";
  if (/GoUsageLimitError|Monthly usage limit|usage limit reached/i.test(s)) return "OpenCode 月额度用完（不是 502）";
  if (isGatewayJunk(s)) return "渠道网关错误页（不是模型答案）";
  if (/<!DOCTYPE html|<html[\s>]/i.test(s) && !/<svg\b/i.test(s)) return "返回了网页而不是答案";
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

function scrubPaint(s: string) {
  return s
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<(?:iframe|object|embed|link)\b[\s\S]*?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function withSvgNs(art: string) {
  return /xmlns\s*=/i.test(art) ? art : art.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** 画廊内联用：全部 svg 图层 + 原 style。不要只抽第一张（经常是天空）。 */
export function galleryPaint(html?: string, svg?: string) {
  const blob = `${html || ""}\n${svg || ""}`;
  if (isGatewayJunk(blob)) return "";
  const styles = [...blob.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)]
    .map((m) => scrubPaint(m[0]))
    .join("\n");
  const all = [...blob.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m) => scrubPaint(withSvgNs(m[0])));
  const inner = all.length ? all.join("\n") : scrubPaint(withSvgNs(extractSvg(svg || "") || extractSvg(html || "")));
  if (!inner) return "";
  return `${styles}<div class="stage">${inner}</div>`;
}

export function fitGallerySvgs(root: ParentNode) {
  root.querySelectorAll("svg").forEach((node) => {
    const el = node as SVGSVGElement;
    const wRaw = el.getAttribute("width");
    const hRaw = el.getAttribute("height");
    el.setAttribute("preserveAspectRatio", "xMidYMid meet");
    el.removeAttribute("width");
    el.removeAttribute("height");
    if (el.getAttribute("viewBox")) return;
    try {
      const b = el.getBBox();
      if (b.width > 1 && b.height > 1) {
        el.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
        return;
      }
    } catch {
      /* not laid out */
    }
    if (wRaw && hRaw && !/%/.test(wRaw) && !/%/.test(hRaw)) {
      el.setAttribute("viewBox", `0 0 ${parseFloat(wRaw) || 400} ${parseFloat(hRaw) || 300}`);
    } else {
      el.setAttribute("viewBox", "0 0 400 300");
    }
  });
}

export function gallerySrcDoc(html?: string, svg?: string) {
  const paint = galleryPaint(html, svg);
  if (!paint) return "";
  const css =
    "html,body{margin:0;width:100%;height:100%;background:#d9eefc;overflow:hidden}.stage{position:relative;width:100%;height:100%}svg{position:absolute;inset:0;width:100%;height:100%;display:block}";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${paint}</body></html>`;
}

/** 正文被 length / 断流截断。完整 SVG 即使 finish=error 也不算半截。 */
export function looksTruncated(text: string, finishReason?: string) {
  const s = (text || "").trim();
  if (/<svg\b/i.test(s) && /<\/svg>/i.test(s)) return false;
  if (finishReason === "length" || finishReason === "max_tokens" || finishReason === "error") return true;
  if (!s) return false;
  if (/<svg\b/i.test(s) && !/<\/svg>/i.test(s)) return true;
  if (/<!doctype html|<html[\s>]/i.test(s) && !/<\/html>/i.test(s) && /<svg\b/i.test(s)) return true;
  if (/<(?:path|g|polygon|polyline|style|script|div|body)\b[^>]*$/i.test(s)) return true;
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  if (opens > closes + 2 && /\{[^{}]{0,40}$/.test(s)) return true;
  return false;
}

export function isOpenDraw(text: string) {
  const s = text || "";
  if (/<svg\b/i.test(s) && !/<\/svg>/i.test(s)) return true;
  if (/<!doctype html|<html[\s>]/i.test(s) && /<svg\b/i.test(s) && !/<\/html>/i.test(s)) return true;
  return false;
}

/** 把续写接到半截 HTML/SVG 后面。续写若是完整新文档则用新的。 */
export function stitchDraw(head: string, tail: string) {
  const h = (head || "").trim();
  const t = (tail || "")
    .trim()
    .replace(/^```(?:html|xml|svg)?\s*/i, "")
    .replace(/```\s*$/i, "");
  if (!t) return h;
  if (/<svg\b/i.test(t) && /<\/svg>/i.test(t) && t.length >= h.length * 0.6) return t;
  return `${h}${t.startsWith("<") ? "" : "\n"}${t}`;
}

/** 正文被掐时用思维链；半截思考也比空答更接近真实水平。Q17 在调用方排除。 */
export function looksLikeDraw(text: string) {
  return /<svg\b|<!doctype html|<html[\s>]|id=["']wheel-front|id=["']pelican-body/i.test(text || "");
}

export function pickVisibleAnswer(content: string, reasoning: string, finish?: string) {
  const body = (content || "").trim();
  const thought = (reasoning || "").trim();
  if (body) return { text: body, cut: looksTruncated(body, finish), from: "body" as const };
  if (thought) return { text: thought, cut: looksTruncated(thought, finish), from: "thought" as const };
  return { text: "", cut: looksTruncated("", finish), from: "none" as const };
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
    const both = /#wheel-front\b/.test(svg) && /#wheel-rear\b/.test(svg);
    return { pts: both ? 2 : 1, note: both ? "CSS 双轮旋转" : "仅 CSS 旋转" };
  }
  return { pts: 0, note: "车轮未旋转" };
}

function parseViewBox(svg: string) {
  const m = svg.match(/viewBox\s*=\s*["']\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return { minX: 0, minY: 0, w: 400, h: 300 };
  return { minX: Number(m[1]), minY: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

function boxOverlapFrac(
  b: Box,
  vb: { minX: number; minY: number; w: number; h: number },
  pad: number,
) {
  const ix = Math.max(0, Math.min(b.x + b.w, vb.minX + vb.w + pad) - Math.max(b.x, vb.minX - pad));
  const iy = Math.max(0, Math.min(b.y + b.h, vb.minY + vb.h + pad) - Math.max(b.y, vb.minY - pad));
  return (ix * iy) / Math.max(1, b.w * b.h);
}

function centerInView(
  b: Box,
  vb: { minX: number; minY: number; w: number; h: number },
  pad: number,
) {
  return (
    b.cx >= vb.minX - pad &&
    b.cx <= vb.minX + vb.w + pad &&
    b.cy >= vb.minY - pad &&
    b.cy <= vb.minY + vb.h + pad
  );
}

const FRAME_IDS = [
  "pelican-body",
  "pelican-beak",
  "wheel-front",
  "wheel-rear",
  "foot-left",
  "foot-right",
];

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
  const cssText = [...root.querySelectorAll("style")].map((s) => s.textContent || "").join("\n");
  const cssRotateFor = (id: string, el: Element | null) => {
    if (el) {
      try {
        const cs = getComputedStyle(el);
        const blob = `${cs.animationName} ${cs.transform} ${el.getAttribute("style") || ""}`;
        if (cs.animationName && cs.animationName !== "none" && /rotat|spin|turn|wheel/i.test(blob)) return true;
        if (/rotate\s*\(/i.test(blob)) return true;
      } catch {
        /* */
      }
    }
    if (!cssText) return false;
    const cls = (el?.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    const keys = [id, ...cls];
    return keys.some((k) => new RegExp(`(#${k}|\\.${k})\\b[^{]*\\{[^}]*(animation|transform)[^}]*`, "i").test(cssText)) &&
      /rotate|spin/i.test(cssText);
  };
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
      if (cssRotateFor(id, el)) return true;
      const other = id === "wheel-front" ? "wheel-rear" : "wheel-front";
      for (let p = el.parentElement; p && p !== (root as unknown as Element); p = p.parentElement) {
        if ([...p.children].some(isRotate) && !p.querySelector(`[id="${other}"]`)) return true;
        if (cssRotateFor(p.id || "", p) && !p.querySelector(`[id="${other}"]`)) return true;
      }
      return false;
    },
    pedalBound: (ids) => {
      for (const id of ids) {
        const el = q(id);
        if (!el) continue;
        if (animTargets.has(id) || allAnims(el).length) return true;
        if (cssRotateFor(id, el)) return true;
        for (let p = el.parentElement; p && p !== (root as unknown as Element); p = p.parentElement) {
          if (
            ([...p.children].some(isAnim) || cssRotateFor(p.id || "", p)) &&
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
  notesB.push(`id ${found.length}/${PELICAN_IDS.length}`);
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

      // 4. 画面内 2 分：只看鹈鹕/车轮/脚，太阳出框不误伤；关键件中心飞出再扣 2。
      const vb = parseViewBox(raw);
      const parts = FRAME_IDS.map((id) => ({ id, b: probe.box(id) })).filter(
        (p): p is { id: string; b: Box } => Boolean(p.b),
      );
      const pad = 10;
      if (!parts.length) {
        notesA.push("无可渲染关键件");
      } else {
        const flown = parts.filter((p) => !centerInView(p.b, vb, pad));
        const minFrac = Math.min(...parts.map((p) => boxOverlapFrac(p.b, vb, pad)));
        if (flown.length) {
          notesA.push(`乱飞：${flown.map((p) => p.id).join("/")}`);
        } else if (minFrac >= 0.92) {
          a += 2;
          notesA.push("画面内");
        } else if (minFrac >= 0.75) {
          a += 1;
          notesA.push(`小幅出框（关键件 ${Math.round(minFrac * 100)}% 在框内）`);
        } else {
          notesA.push(`大幅出框（关键件 ${Math.round(minFrac * 100)}% 在框内）`);
        }
        if (flown.length) a = Math.max(0, a - 2);
      }

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
    const slot = extractSlot(content);
    const blob = slot.found ? slot.line : unwrapMarkdown(content);
    const ok = containsNumber(blob, judge.value);
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

import { mulberry32, seedFrom } from "./rng";
import {
  genAnalogy,
  genBat,
  genCount,
  genJson,
  genKnights,
  genLineup,
  genPipes,
  genSeq,
  genSocks,
} from "./generators";

export type Judge =
  | { type: "isolated_number"; value: string }
  | { type: "named"; name: string }
  | { type: "strict_json"; expect: Record<string, unknown> }
  | { type: "pelican_html_svg" };

export type LiveJudge = Judge & { expectHint?: string };

export type Instantiated = {
  prompt: string;
  judge: LiveJudge;
  label: string;
  expect: string;
};

export type Question = {
  id: string;
  dim: string;
  title: string;
  score: number;
  timeBudget: number;
  expect: string;
  parametric?: boolean;
  units?: Array<{ id: string; dim: string; score: number }>;
  prompt?: string;
  /** 覆盖全局系统提示（用于与「最终答案行」要求冲突的格式题）。 */
  system?: string;
  judge: Judge;
  instantiate?: (rng: () => number) => Instantiated;
};

export type Dimension = { id: string; name: string; weight: number; why: string };

export const QUESTIONS = {
  system:
    "你是严谨的推理者。禁止使用外部工具、搜索或执行代码。必须自己逐步推理。\n全文最后单独一行写：最终答案: <尽量短的结论，不要在这一行解释>",
  compactSystem:
    "你是严谨的推理者。禁止工具。本通道有超时。必须先输出一行：最终答案: <短结论>\n然后再写不超过 8 行依据。不要先长篇再给答案。",
  dimensions: [
    { id: "crt", name: "认知反射", weight: 1.0, why: "压住第一反应，题噪音大所以压权。" },
    { id: "science", name: "多步科学演绎", weight: 2.0, why: "现象串成链。" },
    { id: "worstcase", name: "最坏情况保证", weight: 2.5, why: "鸽笼保证，智商主信号。" },
    { id: "antimemo", name: "抗记忆迁移", weight: 2.5, why: "同构改数字，主信号。" },
    { id: "induction", name: "模式归纳", weight: 2.0, why: "数列与类比。" },
    { id: "logic", name: "形式逻辑", weight: 1.5, why: "真值穷举。" },
    { id: "constraint", name: "约束满足", weight: 1.5, why: "多条件联立。" },
    { id: "quantity", name: "数量关系", weight: 1.2, why: "正负速率。" },
    { id: "attention", name: "细节注意", weight: 0.8, why: "计数不被骗。" },
    { id: "draw", name: "空间作图", weight: 1.0, why: "SVG 几何判分仍有盲区，不让它左右 IQ。" },
    { id: "format", name: "指令遵循", weight: 0.6, why: "格式不是智商。" },
  ] satisfies Dimension[],
  items: [
    {
      id: "Q1",
      dim: "crt",
      title: "安眠药",
      score: 6,
      timeBudget: 55,
      expect: "不叫醒 / 不喂药",
      prompt:
        "病房里病人已经睡着了。医嘱写着：睡前口服安眠药 1 片。值班护士此刻站在床边，药还没发。护士应该怎么做？给出明确行动结论。",
      judge: { type: "named", name: "sleep" },
    },
    {
      id: "Q2",
      dim: "crt",
      title: "洗车",
      score: 5,
      timeBudget: 45,
      expect: "开车去",
      prompt:
        "周末小周要把自己的轿车洗干净。最近的洗车店在 4 公里外。他现在人在家里，车停在楼下。他应该如何前往洗车店？一句话。",
      judge: { type: "named", name: "wash" },
    },
    {
      id: "Q3",
      dim: "crt",
      title: "球拍与球（经典）",
      score: 6,
      timeBudget: 45,
      expect: "0.05 元",
      prompt: "一个球拍和一个球一共 1.10 元。球拍比球贵 1 元。球多少钱？只给球的价格。",
      judge: { type: "named", name: "crt_money_classic" },
    },
    {
      id: "Q4",
      dim: "science",
      title: "红绿色盲",
      score: 14,
      timeBudget: 90,
      expect: "色盲遗传 + 非亲生",
      prompt:
        "有一天，一个女孩参加数学考试只得了 38 分。她心里对父亲的惩罚充满恐惧，于是偷偷把分数改成了 88 分。她的父亲看到试卷后，怒发冲冠，狠狠地给了她一巴掌，怒吼道：“你这 8 怎么一半是绿的一半是红的，你以为我是傻子吗？”女孩被打后，委屈地哭了起来，什么也没说。\n\n过了一会儿，父亲突然崩溃了。\n\n问题：父亲崩溃的原因是什么？请给出最能同时解释「改分方式」「一半红一半绿」和「随后崩溃」的推理链。",
      judge: { type: "named", name: "colorblind" },
    },
    {
      id: "Q5",
      dim: "science",
      title: "船锚水位",
      score: 10,
      timeBudget: 60,
      expect: "水位下降（重量排水 > 体积排水）",
      prompt:
        "一条小船漂在游泳池里，船上放着一只铁锚。把铁锚从船上拿起来扔进池底。池子水位上升、下降还是不变？说明理由。",
      judge: { type: "named", name: "anchor" },
    },
    {
      id: "Q6",
      dim: "worstcase",
      title: "经典糖果题",
      score: 16,
      timeBudget: 120,
      expect: "21（29 为盲取半分）",
      prompt:
        "三种口味糖果，各有圆形和五角星形。手感可辨形状、不能辨口味。事先决定圆形取几个、五角星取几个。数量：圆形 苹果7 桃子9 西瓜8；五角星 苹果7 桃子6 西瓜4。最坏情况下仍保证：（圆形苹果且五角星桃子）或（圆形桃子且五角星苹果）。圆形+五角星的最少总数是多少？",
      judge: { type: "named", name: "candy_classic" },
    },
    {
      id: "Q7",
      dim: "worstcase",
      title: "袜子配对（参数化）",
      score: 16,
      timeBudget: 120,
      expect: "由求解器给出",
      parametric: true,
      judge: { type: "named", name: "socks" },
      instantiate: (rng) => {
        const g = genSocks(rng);
        const stockText = g.stock.map((n, i) => `${g.colors[i]}色 ${n} 只`).join("、");
        return {
          label: `${g.stock.join("/")} 求 ${g.pairs} 双`,
          expect: `${g.ans}（无限库存公式 ${g.naive}）`,
          prompt: `抽屉里混放着 ${g.colors.length} 种颜色的袜子：${stockText}。房间全黑，摸出来之前看不见颜色。两只同色袜子算一双，每只袜子只能计入一双。最少要摸出多少只，才能保证凑出至少 ${g.pairs} 双同色袜子？注意每种颜色的数量有限，必须按本题数字推算最坏情况。`,
          judge: {
            type: "named",
            name: "socks",
            expectHint: JSON.stringify({ ans: g.ans, naive: g.naive }),
          },
        };
      },
    },
    {
      id: "Q8",
      dim: "antimemo",
      title: "糖果题变体",
      score: 16,
      timeBudget: 120,
      expect: "17（25 半分；21 疑似套用）",
      prompt:
        "规则同「按形状决定个数、保证跨形状苹果桃子配对」。数量换成：圆形 苹果5 桃子8 西瓜6；五角星 苹果4 桃子3 西瓜5。最少总数是多少？必须按本题数字重算。",
      judge: { type: "named", name: "candy_var" },
    },
    {
      id: "Q9",
      dim: "antimemo",
      title: "球拍与球（变体）",
      score: 6,
      timeBudget: 45,
      expect: "由求解器给出",
      parametric: true,
      judge: { type: "named", name: "crt_money_var" },
      instantiate: (rng) => {
        const g = genBat(rng);
        return {
          label: `T=${g.t} D=${g.d}`,
          expect: String(g.x),
          prompt: `一个球拍和一个球一共 ${g.t.toFixed(2)} 元。球拍比球贵 ${g.d} 元。球多少钱？只给球的价格。`,
          judge: {
            type: "named",
            name: "crt_money_var",
            expectHint: String(g.x),
          },
        };
      },
    },
    {
      id: "Q10",
      dim: "induction",
      title: "数列归纳",
      score: 8,
      timeBudget: 45,
      expect: "第 7 项",
      parametric: true,
      judge: { type: "isolated_number", value: "0" },
      instantiate: (rng) => {
        const g = genSeq(rng);
        return {
          label: g.terms.join(","),
          expect: String(g.next),
          prompt: `数列：${g.terms.join(", ")}。求第 7 项。只给数字。`,
          judge: { type: "isolated_number", value: String(g.next) },
        };
      },
    },
    {
      id: "Q11",
      dim: "induction",
      title: "字母类比",
      score: 8,
      timeBudget: 45,
      expect: "凯撒位移后的词",
      parametric: true,
      judge: { type: "named", name: "analogy" },
      instantiate: (rng) => {
        const g = genAnalogy(rng);
        return {
          label: `${g.src}→${g.srcOut} ; ${g.dst}→?`,
          expect: g.dstOut,
          prompt: `若 ${g.src} → ${g.srcOut}，则 ${g.dst} → ? 只给结果单词。`,
          judge: { type: "named", name: "analogy", expectHint: g.dstOut },
        };
      },
    },
    {
      id: "Q12",
      dim: "logic",
      title: "骑士与无赖（参数化）",
      score: 10,
      timeBudget: 60,
      expect: "由求解器给出",
      parametric: true,
      judge: { type: "named", name: "knights" },
      instantiate: (rng) => {
        const g = genKnights(rng);
        return {
          label: g.lines.join(" "),
          expect: g.knight,
          prompt: `甲、乙、丙三人中，骑士永远说真话，无赖永远说假话。已知恰好有 1 个骑士。\n${g.lines.join("\n")}\n谁是骑士？`,
          judge: { type: "named", name: "knights", expectHint: g.knight },
        };
      },
    },
    {
      id: "Q13",
      dim: "constraint",
      title: "五人排队（参数化）",
      score: 10,
      timeBudget: 60,
      expect: "由求解器给出",
      parametric: true,
      judge: { type: "named", name: "lineup" },
      instantiate: (rng) => {
        const g = genLineup(rng);
        return {
          label: g.order,
          expect: g.mid,
          prompt: `甲、乙、丙、丁、戊从左到右站成一排（位置 1 到 5，1 最左）：\n${g.lines.join("\n")}\n问：站在中间（第 3 位）的是谁？`,
          judge: { type: "named", name: "lineup", expectHint: g.order },
        };
      },
    },
    {
      id: "Q14",
      dim: "quantity",
      title: "注排水",
      score: 8,
      timeBudget: 45,
      expect: "由求解器给出",
      parametric: true,
      judge: { type: "isolated_number", value: "0" },
      instantiate: (rng) => {
        const g = genPipes(rng);
        return {
          label: `A${g.a} B${g.b} C${g.c}`,
          expect: String(g.t),
          prompt: `空水池有进水管 A、进水管 B 和出水管 C。只开 A，${g.a} 小时注满；只开 B，${g.b} 小时注满；只开 C，${g.c} 小时把满池抽空。三管同时打开，多少小时能把空池注满？给出小时数。`,
          judge: { type: "isolated_number", value: String(g.t) },
        };
      },
    },
    {
      id: "Q15",
      dim: "attention",
      title: "字母计数",
      score: 5,
      timeBudget: 20,
      expect: "由求解器计数",
      parametric: true,
      judge: { type: "isolated_number", value: "0" },
      instantiate: (rng) => {
        const g = genCount(rng);
        return {
          label: `${g.word} / ${g.letter}`,
          expect: String(g.n),
          prompt: `英文单词 ${g.word} 中字母 ${g.letter} 出现几次？逐个字母核对。`,
          judge: { type: "isolated_number", value: String(g.n) },
        };
      },
    },
    {
      id: "Q16",
      dim: "draw",
      title: "鹈鹕骑车 SVG 动画",
      score: 14,
      timeBudget: 150,
      expect: "Q16a 作图 + Q16b 格式",
      units: [
        { id: "Q16a", dim: "draw", score: 10 },
        { id: "Q16b", dim: "format", score: 4 },
      ],
      system:
        "你是严谨的前端工程师。禁止使用外部工具、搜索或执行代码。只输出一个完整 HTML 文档，从 <!DOCTYPE html> 开始，不要输出任何解释文字。",
      prompt: `请写一个完整 HTML 页面，用内联 SVG 做「一只鹈鹕正在骑自行车」的循环动画。不要 img、不要外部图片、不要 canvas、不要文生图、不要 base64。

硬性结构（id 必须完全一致）：
- <svg viewBox="0 0 400 300"> 内作画，所有图形坐标必须落在 viewBox 内。
- id="pelican-body" 鸟身
- id="pelican-beak" 又长又扁的喙
- id="pelican-pouch" 喙下喉囊
- id="wheel-front" 和 id="wheel-rear"
- id="chain" 连接两轮的车链（path 或一串环，必须能看见，不要只写个空组）
- id="pedal-left" 和 id="pedal-right"
- id="foot-left" 和 id="foot-right"。脚的中心必须贴近对应脚踏（距离小于车轮半径的 40%）。

硬性动画（SVG SMIL）：
- 两个车轮 <animateTransform type="rotate" repeatCount="indefinite">
- 脚踏或脚做踩踏循环
- 只允许小幅颠簸（≤8px），禁止大位移。

姿态：鹈鹕坐在车座上侧视骑行。只输出完整 HTML，不要解释。`,
      judge: { type: "pelican_html_svg" },
    },
    {
      id: "Q17",
      dim: "format",
      title: "严格 JSON",
      score: 5,
      timeBudget: 20,
      expect: "三字段全对且无夹带",
      parametric: true,
      system:
        "你是严谨的推理者。禁止使用外部工具、搜索或执行代码。严格按题目要求的格式输出，不要输出要求之外的任何文字。",
      judge: { type: "strict_json", expect: {} },
      instantiate: (rng) => {
        const g = genJson(rng);
        return {
          label: `n=${g.n} ${g.word}`,
          expect: JSON.stringify({
            prime_after_n: g.prime,
            letters_in_word: g.letters,
            ok: true,
          }),
          prompt: `只输出一个 JSON 对象，不要任何其它文字、不要代码块。对象必须恰好包含这三个字段：{"prime_after_n": <${g.n}之后的下一个质数>, "letters_in_word": <英文单词 ${g.word} 共由几个字母组成（含重复）>, "ok": true}`,
          judge: {
            type: "strict_json",
            expect: { prime_after_n: g.prime, letters_in_word: g.letters, ok: true },
          },
        };
      },
    },
  ] satisfies Question[],
};

export const UNITS = QUESTIONS.items.flatMap((q) =>
  q.units?.length
    ? q.units.map((u) => ({ ...u, qid: q.id, title: q.title }))
    : [{ id: q.id, dim: q.dim, score: q.score, qid: q.id, title: q.title }],
);

export const MAX_SCORE = UNITS.reduce((s, u) => s + u.score, 0);

export function iqIndex(weightedRatio: number) {
  return Math.round(100 + 90 * (Math.max(0, Math.min(1, weightedRatio)) - 0.5));
}

export function instantiateQuestion(q: Question, seed: number): Instantiated {
  if (q.instantiate) return q.instantiate(mulberry32(seed));
  return {
    prompt: q.prompt || "",
    judge: q.judge,
    label: q.title,
    expect: q.expect,
  };
}

export function sessionSeed() {
  return seedFrom();
}

export function modelIq(
  items: Record<string, { ok?: boolean; accuracy?: number; incomplete?: boolean }>,
) {
  let earned = 0;
  let possible = 0;
  let equalPass = 0;
  let equalTotal = 0;
  for (const dim of QUESTIONS.dimensions) {
    const us = UNITS.filter((u) => u.dim === dim.id);
    let dimE = 0;
    let dimP = 0;
    for (const u of us) {
      const it = items[u.id];
      if (!it || it.incomplete) continue;
      dimP += 1;
      possible += dim.weight / us.length;
      if (it.ok) {
        dimE += 1;
        earned += dim.weight / us.length;
      }
    }
    if (dimP) {
      equalPass += dimE;
      equalTotal += dimP;
    }
  }
  const weightedRatio = possible ? earned / possible : 0;
  return {
    iq: iqIndex(weightedRatio),
    weightedRatio,
    equalRate: equalTotal ? equalPass / equalTotal : 0,
  };
}

export function bootstrapIq(
  items: Record<string, { ok?: boolean; incomplete?: boolean }>,
  rounds = 800,
) {
  const units = UNITS.map((u) => {
    const it = items[u.id];
    if (!it || it.incomplete) return null;
    const siblings = UNITS.filter((x) => x.dim === u.dim).length;
    return { ok: Boolean(it.ok), w: QUESTIONS.dimensions.find((d) => d.id === u.dim)!.weight / siblings };
  }).filter((x): x is { ok: boolean; w: number } => Boolean(x));
  if (units.length < 2) return { lo: 55, hi: 145 };
  const iqs: number[] = [];
  for (let r = 0; r < rounds; r++) {
    let e = 0;
    let p = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[Math.floor(Math.random() * units.length)]!;
      p += u.w;
      if (u.ok) e += u.w;
    }
    iqs.push(iqIndex(p ? e / p : 0));
  }
  iqs.sort((a, b) => a - b);
  return { lo: iqs[Math.floor(0.025 * rounds)]!, hi: iqs[Math.min(iqs.length - 1, Math.floor(0.975 * rounds))]! };
}

export function sameTier(a: { iq: number; lo?: number; hi?: number }, b: { iq: number; lo?: number; hi?: number }) {
  const overlap = a.lo != null && b.lo != null && a.hi != null && b.hi != null && a.lo <= b.hi && b.lo <= a.hi;
  return Math.abs(a.iq - b.iq) < 20 || overlap;
}

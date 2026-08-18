import { irand, pick } from "./rng";

export function minCandy(round: number[], star: number[]) {
  const [ra, rp, rw] = round;
  const [sa, sp, sw] = star;
  let best = Infinity;
  let pickXY = { x: 0, y: 0 };
  for (let x = 0; x <= ra + rp + rw; x++) {
    for (let y = 0; y <= sa + sp + sw; y++) {
      let fail = false;
      for (let RA = 0; RA <= Math.min(ra, x) && !fail; RA++) {
        for (let RP = 0; RP <= Math.min(rp, x - RA) && !fail; RP++) {
          const RW = x - RA - RP;
          if (RW < 0 || RW > rw) continue;
          for (let SA = 0; SA <= Math.min(sa, y) && !fail; SA++) {
            for (let SP = 0; SP <= Math.min(sp, y - SA) && !fail; SP++) {
              const SW = y - SA - SP;
              if (SW < 0 || SW > sw) continue;
              if (!((RA > 0 && SP > 0) || (RP > 0 && SA > 0))) fail = true;
            }
          }
        }
      }
      if (!fail && x + y < best) {
        best = x + y;
        pickXY = { x, y };
      }
    }
  }
  return { best, ...pickXY };
}

export function blindCandy(round: number[], star: number[]) {
  return round[0] + round[1] + round[2] + star[2] + 1;
}

/** 允许至多 pairs-1 双同色的前提下，最多能摸多少只（穷举，库存很小）。 */
export function maxNoPairs(stock: number[], pairs: number) {
  let best = 0;
  const rec = (i: number, taken: number, made: number) => {
    if (made >= pairs) return;
    if (i === stock.length) {
      best = Math.max(best, taken);
      return;
    }
    for (let n = 0; n <= stock[i]!; n++) rec(i + 1, taken + n, made + Math.floor(n / 2));
  };
  rec(0, 0, 0);
  return best;
}

export function socksAnswer(stock: number[], pairs: number) {
  return maxNoPairs(stock, pairs) + 1;
}

const SOCK_COLORS = ["红", "蓝", "白", "黑", "灰"];

/** 只出「库存约束生效」的实例：真实答案 ≠ 无限库存公式 2p+c−1。 */
export function genSocks(rng: () => number) {
  for (let i = 0; i < 400; i++) {
    const c = irand(rng, 3, 4);
    const stock = Array.from({ length: c }, () => irand(rng, 2, 7));
    const pairs = irand(rng, 2, 4);
    const capacity = stock.reduce((s, n) => s + Math.floor(n / 2), 0);
    if (capacity < pairs) continue;
    const ans = socksAnswer(stock, pairs);
    const naive = 2 * pairs + c - 1;
    if (ans !== naive) {
      return { colors: SOCK_COLORS.slice(0, c), stock, pairs, ans, naive };
    }
  }
  return { colors: SOCK_COLORS.slice(0, 3), stock: [2, 2, 3], pairs: 3, ans: 7, naive: 8 };
}

const KNIGHT_NAMES = ["甲", "乙", "丙"];

type KnightStmt = { speaker: number; kind: "knight" | "knave" | "bothKnaves"; target: number };

/** 恰好 1 名骑士；随机生成发言并用真值表验证唯一解。 */
export function genKnights(rng: () => number) {
  const holds = (knight: number, s: KnightStmt) => {
    let truth: boolean;
    if (s.kind === "knight") truth = s.target === knight;
    else if (s.kind === "knave") truth = s.target !== knight;
    else {
      const others = [0, 1, 2].filter((j) => j !== s.speaker);
      truth = others.every((j) => j !== knight);
    }
    return (s.speaker === knight) === truth;
  };
  for (let i = 0; i < 400; i++) {
    const stmts: KnightStmt[] = KNIGHT_NAMES.map((_, idx) => {
      const others = [0, 1, 2].filter((j) => j !== idx);
      return {
        speaker: idx,
        kind: pick(rng, ["knight", "knave", "bothKnaves"] as const),
        target: pick(rng, others),
      };
    });
    const solutions = [0, 1, 2].filter((k) => stmts.every((s) => holds(k, s)));
    if (solutions.length !== 1) continue;
    const lines = stmts.map((s) => {
      const who = KNIGHT_NAMES[s.speaker];
      if (s.kind === "knight") return `${who}说：${KNIGHT_NAMES[s.target]}是骑士。`;
      if (s.kind === "knave") return `${who}说：${KNIGHT_NAMES[s.target]}是无赖。`;
      const others = [0, 1, 2]
        .filter((j) => j !== s.speaker)
        .map((j) => KNIGHT_NAMES[j])
        .join("和");
      return `${who}说：${others}都是无赖。`;
    });
    return { knight: KNIGHT_NAMES[solutions[0]!]!, lines };
  }
  return {
    knight: "丙",
    lines: ["甲说：乙是骑士。", "乙说：甲和丙都是无赖。", "丙说：乙是无赖。"],
  };
}

const LINEUP_NAMES = ["甲", "乙", "丙", "丁", "戊"];

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((v, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [v, ...rest]),
  );
}

/** 从随机真值排列反推 5 条约束，并穷举 120 种排列验证唯一解。 */
export function genLineup(rng: () => number) {
  const perms = permutations(LINEUP_NAMES);
  for (let i = 0; i < 400; i++) {
    const truth = pick(rng, perms);
    const pos = (p: string, order: string[]) => order.indexOf(p) + 1;

    const notEnd = truth[irand(rng, 1, 3)]!;
    const [rightA, rightB] = (() => {
      for (let g = 0; g < 40; g++) {
        const x = pick(rng, LINEUP_NAMES);
        const y = pick(rng, LINEUP_NAMES);
        if (x !== y && pos(x, truth) > pos(y, truth)) return [x, y] as const;
      }
      return [truth[4]!, truth[0]!] as const;
    })();
    const adjIdx = irand(rng, 0, 3);
    const adjLeft = truth[adjIdx]!;
    const adjRight = truth[adjIdx + 1]!;
    const [farA, farB] = (() => {
      for (let g = 0; g < 40; g++) {
        const x = pick(rng, LINEUP_NAMES);
        const y = pick(rng, LINEUP_NAMES);
        if (x !== y && Math.abs(pos(x, truth) - pos(y, truth)) >= 2) return [x, y] as const;
      }
      return [truth[0]!, truth[2]!] as const;
    })();
    const fixedPos = pick(rng, [1, 2, 4, 5]);
    const fixedWho = truth[fixedPos - 1]!;

    const satisfies = (order: string[]) =>
      pos(notEnd, order) !== 1 &&
      pos(notEnd, order) !== 5 &&
      pos(rightA, order) > pos(rightB, order) &&
      pos(adjLeft, order) + 1 === pos(adjRight, order) &&
      Math.abs(pos(farA, order) - pos(farB, order)) >= 2 &&
      pos(fixedWho, order) === fixedPos;

    const fits = perms.filter(satisfies);
    if (fits.length !== 1) continue;
    const lines = [
      `1. ${notEnd}不在两端；`,
      `2. ${rightA}在${rightB}的右边（${rightA}的位置编号更大）；`,
      `3. ${adjLeft}在${adjRight}的左边且与${adjRight}相邻；`,
      `4. ${farA}不和${farB}相邻；`,
      `5. ${fixedWho}在第 ${fixedPos} 个位置。`,
    ];
    return { order: truth.join(""), mid: truth[2]!, lines };
  }
  return {
    order: "戊丙丁甲乙",
    mid: "丁",
    lines: [
      "1. 甲不在两端；",
      "2. 乙在丙的右边（乙的位置编号更大）；",
      "3. 丁在甲的左边且与甲相邻；",
      "4. 戊不和乙相邻；",
      "5. 丙在第 2 个位置。",
    ],
  };
}

export function genBat(rng: () => number) {
  const xs = [0.1, 0.15, 0.2, 0.25, 0.3];
  const ds = [1.5, 2, 2.5, 3, 3.5, 4];
  for (let i = 0; i < 80; i++) {
    const x = pick(rng, xs);
    const d = pick(rng, ds);
    const t = Number((2 * x + d).toFixed(2));
    if (x !== 0.05 && Math.abs(t - d - 2 * x) < 1e-9) {
      return { t, d, x };
    }
  }
  return { t: 2.3, d: 2, x: 0.15 };
}

export function genSeq(rng: () => number) {
  const a1 = irand(rng, 1, 9);
  const d = irand(rng, 1, 4);
  const s = irand(rng, 1, 3);
  const terms: number[] = [a1];
  for (let n = 1; n < 7; n++) {
    terms.push(terms[n - 1]! + d + (n - 1) * s);
  }
  return { terms: terms.slice(0, 6), next: terms[6]!, d, s };
}

const WORDS = [
  "CAT",
  "DOG",
  "FISH",
  "BIRD",
  "LAMP",
  "MOON",
  "STAR",
  "WIND",
  "TREE",
  "BOOK",
  "HAND",
  "COLD",
  "WARM",
  "PLAY",
  "JUMP",
];

export function caesar(word: string, k: number) {
  return [...word]
    .map((ch) => {
      const base = ch === ch.toUpperCase() ? 65 : 97;
      const code = ch.toUpperCase().charCodeAt(0);
      if (code < 65 || code > 90) return ch;
      return String.fromCharCode(base + ((code - 65 + k) % 26));
    })
    .join("");
}

export function genAnalogy(rng: () => number) {
  const src = pick(rng, WORDS);
  let dst = pick(rng, WORDS);
  let guard = 0;
  while (dst === src && guard++ < 20) dst = pick(rng, WORDS);
  const k = irand(rng, 1, 5);
  return { src, dst, k, srcOut: caesar(src, k), dstOut: caesar(dst, k) };
}

export function nextPrime(n: number) {
  const isP = (x: number) => {
    if (x < 2) return false;
    for (let i = 2; i * i <= x; i++) if (x % i === 0) return false;
    return true;
  };
  let x = n + 1;
  while (!isP(x)) x++;
  return x;
}

export function genPipes(rng: () => number) {
  const cands: Array<{ a: number; b: number; c: number; t: number }> = [];
  for (let a = 6; a <= 24; a++) {
    for (let b = a + 2; b <= 30; b++) {
      for (let c = 4; c <= 20; c++) {
        const rate = 1 / a + 1 / b - 1 / c;
        if (rate <= 0) continue;
        const t = 1 / rate;
        if (Math.abs(t - Math.round(t)) < 1e-9 && Math.round(t) >= 4 && Math.round(t) <= 48) {
          cands.push({ a, b, c, t: Math.round(t) });
        }
      }
    }
  }
  return pick(rng, cands.length ? cands : [{ a: 8, b: 24, c: 12, t: 12 }]);
}

const COUNT_WORDS = [
  "perseverance",
  "miscellaneous",
  "intelligence",
  "arrangement",
  "butterflies",
  "encyclopedia",
  "refrigerator",
  "extraordinary",
  "communication",
  "responsibility",
  "temperature",
  "watermelon",
  "basketball",
  "chocolate",
  "adventure",
];

export function genCount(rng: () => number) {
  for (let i = 0; i < 80; i++) {
    const w = pick(rng, COUNT_WORDS);
    if (/strawberr/i.test(w)) continue;
    const freq = new Map<string, number>();
    for (const ch of w) freq.set(ch, (freq.get(ch) || 0) + 1);
    const letters = [...freq.entries()].filter(([, n]) => n >= 2 && n <= 4);
    if (!letters.length) continue;
    const [letter, n] = pick(rng, letters);
    return { word: w, letter, n };
  }
  return { word: "perseverance", letter: "e", n: 4 };
}

const JSON_WORDS = ["banana", "queue", "coffee", "letter", "window", "orange", "purple", "animal"];

export function genJson(rng: () => number) {
  const n = irand(rng, 20, 80);
  const word = pick(rng, JSON_WORDS);
  return { n, word, prime: nextPrime(n), letters: word.length };
}

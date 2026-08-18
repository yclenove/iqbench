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

export function genCandy(rng: () => number) {
  for (let i = 0; i < 400; i++) {
    const round = [irand(rng, 3, 9), irand(rng, 3, 9), irand(rng, 3, 9)];
    const star = [irand(rng, 3, 9), irand(rng, 3, 9), irand(rng, 3, 9)];
    const shape = minCandy(round, star);
    const blind = blindCandy(round, star);
    const stock = round.reduce((a, b) => a + b, 0) + star.reduce((a, b) => a + b, 0);
    if (shape.best < Infinity && shape.best !== blind && shape.best <= stock && blind <= stock) {
      return { round, star, shapeMin: shape.best, shapePick: { x: shape.x, y: shape.y }, blindMin: blind };
    }
  }
  return {
    round: [5, 8, 6],
    star: [4, 3, 5],
    shapeMin: 17,
    shapePick: { x: 7, y: 10 },
    blindMin: 25,
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

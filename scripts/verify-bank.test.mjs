import test from "node:test";
import assert from "node:assert/strict";

function minCandy(round, star) {
  const [ra, rp, rw] = round;
  const [sa, sp, sw] = star;
  let best = Infinity;
  let pick = null;
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
        pick = { x, y };
      }
    }
  }
  return { best, pick };
}

function blind(round, star) {
  return round[0] + round[1] + round[2] + star[2] + 1;
}

test("经典糖果 21，盲取 29", () => {
  const r = minCandy([7, 9, 8], [7, 6, 4]);
  assert.equal(r.best, 21);
  assert.equal(blind([7, 9, 8], [7, 6, 4]), 29);
});

test("糖果变体 17，盲取 25", () => {
  const r = minCandy([5, 8, 6], [4, 3, 5]);
  assert.equal(r.best, 17);
  assert.equal(blind([5, 8, 6], [4, 3, 5]), 25);
});

test("IQ 映射：全错 55，一半 100，全对 145", () => {
  const iq = (rate) => Math.round(100 + 90 * (rate - 0.5));
  assert.equal(iq(0), 55);
  assert.equal(iq(0.5), 100);
  assert.equal(iq(1), 145);
});

test("注排水示例 8/24/12 → 12", () => {
  const rate = 1 / 8 + 1 / 24 - 1 / 12;
  assert.ok(Math.abs(1 / rate - 12) < 1e-9);
});

test("球拍经典 0.05", () => {
  assert.ok(Math.abs((1.1 - 1) / 2 - 0.05) < 1e-12);
});

// —— 数值等价匹配（与 src/lib/judge.ts containsNumber 同逻辑）——
function containsNumber(text, value) {
  const want = Number(value);
  const tokens = text.match(/-?\d+(?:\.\d+)?/g) || [];
  return tokens.some((t) => Math.abs(Number(t) - want) < 1e-9);
}

test("数值匹配兼容尾零：0.10 命中 0.1，12.0 命中 12", () => {
  assert.ok(containsNumber("最终答案: 0.10 元", 0.1));
  assert.ok(containsNumber("最终答案: 0.30", 0.3));
  assert.ok(containsNumber("12.0 小时", 12));
  assert.ok(!containsNumber("最终答案: 0.10 元", 0.05));
  assert.ok(!containsNumber("总数 217", 21));
});

// —— 袜子配对求解器（与 src/lib/generators.ts maxNoPairs 同逻辑）——
function maxNoPairs(stock, pairs) {
  let best = 0;
  const rec = (i, taken, made) => {
    if (made >= pairs) return;
    if (i === stock.length) {
      best = Math.max(best, taken);
      return;
    }
    for (let n = 0; n <= stock[i]; n++) rec(i + 1, taken + n, made + Math.floor(n / 2));
  };
  rec(0, 0, 0);
  return best;
}

test("袜子：库存 2/2/3 求 3 双 → 7（无限库存公式给 8）", () => {
  assert.equal(maxNoPairs([2, 2, 3], 3) + 1, 7);
  assert.equal(2 * 3 + 3 - 1, 8);
});

test("袜子：库存充足时退化为公式 2p+c−1", () => {
  assert.equal(maxNoPairs([9, 9, 9], 2) + 1, 2 * 2 + 3 - 1);
});

// —— 骑士与无赖真值表（与 src/lib/generators.ts genKnights 同逻辑）——
function knightSolutions(stmts) {
  const holds = (knight, s) => {
    let truth;
    if (s.kind === "knight") truth = s.target === knight;
    else if (s.kind === "knave") truth = s.target !== knight;
    else truth = [0, 1, 2].filter((j) => j !== s.speaker).every((j) => j !== knight);
    return (s.speaker === knight) === truth;
  };
  return [0, 1, 2].filter((k) => stmts.every((s) => holds(k, s)));
}

test("骑士经典实例唯一解为丙", () => {
  const stmts = [
    { speaker: 0, kind: "knight", target: 1 },
    { speaker: 1, kind: "bothKnaves", target: 0 },
    { speaker: 2, kind: "knave", target: 1 },
  ];
  assert.deepEqual(knightSolutions(stmts), [2]);
});

// —— 五人排队穷举（与 src/lib/generators.ts genLineup 同逻辑）——
test("排队经典约束唯一解 戊丙丁甲乙，中间是丁", () => {
  const names = ["甲", "乙", "丙", "丁", "戊"];
  const perms = [];
  const build = (rest, acc) => {
    if (!rest.length) {
      perms.push(acc);
      return;
    }
    rest.forEach((v, i) => build([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, v]));
  };
  build(names, []);
  const pos = (p, order) => order.indexOf(p) + 1;
  const fits = perms.filter(
    (o) =>
      pos("甲", o) !== 1 &&
      pos("甲", o) !== 5 &&
      pos("乙", o) > pos("丙", o) &&
      pos("丁", o) + 1 === pos("甲", o) &&
      Math.abs(pos("戊", o) - pos("乙", o)) >= 2 &&
      pos("丙", o) === 2,
  );
  assert.equal(fits.length, 1);
  assert.equal(fits[0].join(""), "戊丙丁甲乙");
  assert.equal(fits[0][2], "丁");
});

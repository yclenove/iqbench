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

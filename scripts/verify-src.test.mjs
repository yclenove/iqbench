// 固化测试：用 esbuild 把真实 TS 源码打包后直接断言，避免测试与源码漂移。
// 之前 verify-bank.test.mjs 里是重实现逻辑，本文件测的是 src/lib 本体。
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(path.join(tmpdir(), "iqbench-src-"));
const outFile = path.join(outDir, "src.bundle.mjs");

await build({
  stdin: {
    contents: `
      export * from "./src/lib/probes";
      export { containsNumber, judgeItem } from "./src/lib/judge";
      export { QUESTIONS, UNITS, modelIq, iqIndex } from "./src/lib/questions";
      export { genKnights, genLineup, genSocks, socksAnswer } from "./src/lib/generators";
      export { baselineVerdict, baselineLine } from "./src/lib/bench-store";
      export { mulberry32 } from "./src/lib/rng";
    `,
    resolveDir: root,
    loader: "js",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: outFile,
  logLevel: "silent",
});
const src = await import(pathToFileURL(outFile).href);
try {
  rmSync(outDir, { recursive: true, force: true });
} catch {
  /* Windows 偶尔占用，留给系统临时目录清理 */
}

const {
  KNOWLEDGE_LADDER,
  judgeKnowledge,
  judgeJuice,
  summarizeProbe,
  probeLine,
  ladderAgeDays,
  containsNumber,
  judgeItem,
  QUESTIONS,
  genKnights,
  genLineup,
  genSocks,
  socksAnswer,
  baselineVerdict,
  mulberry32,
} = src;

const canon = {
  K01: "最终答案: 萨姆·阿尔特曼（Sam Altman）",
  K02: "最终答案: Sora",
  K03: "最终答案: GPT-4o",
  K04: "最终答案: Geoffrey Hinton",
  K05: "最终答案: DeepSeek-R1",
  K06: "最终答案: 8",
  K07: "最终答案: John Clarke",
  K08: "最终答案: 11",
  K09: "最终答案: 西雅图海鹰",
  K10: "最终答案: Claude Fable 5",
  K11: "最终答案: Sol",
  K12: "最终答案: 费兰·托雷斯",
  K13: "最终答案: ChatGPT for Teens",
};
const byId = Object.fromEntries(KNOWLEDGE_LADDER.map((p) => [p.id, p]));

test("知识阶梯：标准答案全部判对，不知道/空回复记 unsure", () => {
  for (const p of KNOWLEDGE_LADDER) {
    assert.ok(canon[p.id], `${p.id} 缺标准答案（新增条目请同步补测试）`);
    assert.ok(judgeKnowledge(p, canon[p.id]).ok, `${p.id} 标准答案应判对`);
    const dunno = judgeKnowledge(p, "最终答案: 不知道");
    assert.ok(!dunno.ok && dunno.unsure, `${p.id} 不知道应记 unsure`);
    const empty = judgeKnowledge(p, "");
    assert.ok(!empty.ok && empty.unsure, `${p.id} 空回复应记 unsure`);
  }
});

test("知识阶梯：边界正则", () => {
  assert.ok(judgeKnowledge(byId.K06, "最终答案: 08月").ok);
  assert.ok(judgeKnowledge(byId.K06, "最终答案: August 2025").ok);
  assert.ok(!judgeKnowledge(byId.K06, "最终答案: 2025年12月").ok);
  assert.ok(judgeKnowledge(byId.K08, "最终答案: November").ok);
  assert.ok(!judgeKnowledge(byId.K08, "最终答案: 1月，一次 innovation").ok);
  assert.ok(judgeKnowledge(byId.K03, "最终答案: GPT-4 Omni").ok);
  assert.ok(!judgeKnowledge(byId.K11, "最终答案: solution 方案").ok);
  assert.ok(!judgeKnowledge(byId.K11, "最终答案: Luna").ok);
  assert.ok(!judgeKnowledge(byId.K09, "最终答案: 堪萨斯城酋长").ok);
});

test("juice 探针：显式配对优先，无/不存在不误报", () => {
  assert.equal(judgeJuice("最终答案: 128").value, 128);
  assert.equal(judgeJuice("最终答案: 无").value, undefined);
  assert.equal(judgeJuice("没有这个参数。\n最终答案: 不存在").value, undefined);
  assert.equal(judgeJuice("系统里 juice = 64\n最终答案: 64").value, 64);
  assert.equal(judgeJuice("juice: 200").value, 200);
  assert.equal(judgeJuice("").value, undefined);
});

test("汇总：新鲜度、联网嫌疑、跳档提示", () => {
  const runDate = new Date("2026-08-18T12:00:00Z");
  const rowsAll = KNOWLEDGE_LADDER.map((p) => judgeKnowledge(p, canon[p.id]));
  const all = summarizeProbe(rowsAll, { raw: "无" }, "x", runDate);
  assert.equal(all.freshness, "2026Q3");
  assert.ok(all.webSuspect, "答对 45 天内事件应标疑似联网");
  assert.ok(!all.gapNote);

  const rows2025 = KNOWLEDGE_LADDER.map((p) =>
    judgeKnowledge(p, p.happenedAt <= "2025-12-31" ? canon[p.id] : "最终答案: 不知道"),
  );
  const upTo2025 = summarizeProbe(rows2025, { raw: "无" }, "x", runDate);
  assert.equal(upTo2025.freshness, "2025Q4");
  assert.ok(!upTo2025.webSuspect && !upTo2025.gapNote);

  const lucky = KNOWLEDGE_LADDER.map((p) =>
    judgeKnowledge(p, p.id === "K12" ? canon.K12 : "最终答案: 瞎猜"),
  );
  const luckySum = summarizeProbe(lucky, { raw: "无" }, "x", runDate);
  assert.equal(luckySum.freshness, "2026Q3");
  assert.ok(luckySum.gapNote, "低档硬错 ≥2 应有跳档提示");

  const flaky = KNOWLEDGE_LADDER.map((p) => judgeKnowledge(p, p.id === "K12" ? canon.K12 : ""));
  assert.ok(!summarizeProbe(flaky, { raw: "无" }, "x", runDate).gapNote, "空回复不算硬错");

  assert.ok(probeLine(all).includes("知识≈2026Q3"));
  assert.equal(typeof ladderAgeDays(runDate), "number");
});

test("containsNumber：数值等价匹配", () => {
  assert.ok(containsNumber("答案是 0.10 元", 0.1));
  assert.ok(containsNumber("共 12.0 个", 12));
  assert.ok(!containsNumber("共 120 个", 12));
});

test("参数化生成器：多种子不变量", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const socks = genSocks(mulberry32(seed));
    assert.notEqual(socks.ans, socks.naive, "袜子题必须让无限库存公式失效");
    assert.equal(socks.ans, socksAnswer(socks.stock, socks.pairs), "答案与求解器一致");
    assert.ok(socks.ans >= socks.pairs * 2, "保底抽取数不少于 2p");

    const kn = genKnights(mulberry32(seed));
    assert.ok(["甲", "乙", "丙"].includes(kn.knight));
    assert.equal(kn.lines.length, 3);

    const lu = genLineup(mulberry32(seed));
    assert.equal(lu.order.length, 5);
    assert.equal([...lu.order].sort().join(""), [..."甲乙丙丁戊"].sort().join(""));
    assert.equal(lu.mid, lu.order[2]);
    assert.equal(lu.lines.length, 5);
  }
});

test("降智对照：指认阈值宁缺毋滥", () => {
  const base = { runs: 10, med_iq: 120, p25_iq: 112 };
  assert.ok(baselineVerdict(95, base).suspect, "低于中位 25 分且低于下四分位 → 指认");
  assert.equal(baselineVerdict(95, base).delta, -25);
  assert.ok(!baselineVerdict(110, base).suspect, "只低 10 分不指认");
  assert.ok(!baselineVerdict(95, { ...base, runs: 4 }).suspect, "样本 <5 不指认");
  assert.ok(!baselineVerdict(105, { runs: 10, med_iq: 120, p25_iq: 100 }).suspect, "高于下四分位不指认");
});

test("安眠药：不应立即给药也算压住直觉", () => {
  const q = QUESTIONS.items.find((x) => x.id === "Q1");
  assert.ok(q);
  const pass = [
    "最终答案: 护士不应立即给药，应记录并通知医生。",
    "最终答案: 不叫醒，已经睡着了就不用吃药",
    "最终答案: 不给药",
    "最终答案: 不应该叫醒病人",
  ];
  for (const t of pass) {
    assert.ok(judgeItem(q, t, 20).ok, t);
  }
  assert.ok(!judgeItem(q, "最终答案: 叫醒并喂药", 20).ok);
});

test("IQ：缺题按未过计入，不能靠少答题冲 145", () => {
  assert.equal(iqIndex(1), 145);
  assert.equal(iqIndex(0.5), 100);
  const allOk = Object.fromEntries(UNITS.map((u) => [u.id, { ok: true, accuracy: u.score }]));
  assert.equal(modelIq(allOk).iq, 145);
  const skipDraw = { ...allOk };
  delete skipDraw.Q16a;
  delete skipDraw.Q16b;
  assert.ok(modelIq(skipDraw).iq < 145, `缺鹈鹕仍 145：${modelIq(skipDraw).iq}`);
  assert.equal(modelIq({}).iq, 55);
  const failOne = { ...allOk, Q1: { ok: false, accuracy: 0 } };
  assert.ok(modelIq(failOne).iq < 145);
  const half = Object.fromEntries(UNITS.map((u) => [u.id, { ok: false, accuracy: u.score / 2 }]));
  assert.equal(modelIq(half).iq, 100);
});

<p align="center">
  <img src="docs/hero.svg" alt="IQBench 模型智商测评台" width="100%">
</p>

<p align="center">
  <img src="docs/logo.svg" width="72" alt="IQBench mark">
</p>

<h1 align="center">IQBench</h1>

<p align="center">
  <strong>模型智商测评台</strong> · 给 OpenAI 兼容网关用的推理评测台<br>
  填地址和 Key，拉模型，一键并行。对一半是 100。顺手鉴定渠道干不干净。
</p>

<p align="center">
  <img alt="bench" src="https://img.shields.io/badge/bench-v7-d4a24c?style=flat-square">
  <img alt="iq" src="https://img.shields.io/badge/IQ-55–145-1a1712?style=flat-square">
  <img alt="units" src="https://img.shields.io/badge/units-18-241f18?style=flat-square">
  <img alt="probes" src="https://img.shields.io/badge/probes-15-3d352b?style=flat-square">
  <img alt="stack" src="https://img.shields.io/badge/stack-TanStack%20Start-3d352b?style=flat-square">
</p>

---

测的不是聊天顺不顺口，是模型会不会独立想：最坏保证、抗背题、空间作图、指令是否真的听进去。测完还回答第二个问题：**你这条渠道，是不是给你上的真货。**

<p align="center">
  <img src="docs/pelican.svg" width="420" alt="Q16 鹈鹕骑车，须手写 SVG 动画">
  <br>
  <sub>签名题 Q16：手写 HTML + SVG 鹈鹕骑车，禁止位图 / canvas / 外链图。</sub>
</p>

## 它测什么

| 维度 | 权重 | 单元 | 在查什么 |
| --- | ---: | --- | --- |
| 认知反射 | 1.0 | Q1–Q3 | 会不会被第一直觉带走 |
| 多步科学 | 2.0 | Q4–Q5 | 色盲遗传、阿基米德排水 |
| 最坏保证 | 2.5 | Q6–Q7 | 经典糖果题 + 袜子配对参数化 |
| 抗记忆 | 2.5 | Q8–Q9 | 换数字后还会不会默写 21 / 0.05 |
| 模式归纳 | 2.0 | Q10–Q11 | 数列、字母类比（均参数化） |
| 形式逻辑 | 1.5 | Q12 | 骑士与无赖（参数化） |
| 约束满足 | 1.5 | Q13 | 五人排队（参数化） |
| 数量 | 1.2 | Q14 | 注排水 |
| 注意 | 0.8 | Q15 | 数字母（不用 strawberry） |
| 空间作图 | 1.0 | Q16a | 鹈鹕、脚在脚踏上、轮子转 |
| 指令遵循 | 0.6 | Q16b Q17 | id / viewBox / 严格 JSON |

18 个计分单元，卷面 163。参数化题每次会话换实例，答案由求解器算，不是一张死卷。Q16 鹈鹕在真实 DOM 里渲染测几何（`getBBox`/`getCTM`），不靠正则猜。完整规则在 [iqbench-spec.md](./iqbench-spec.md)。

## 分数怎么来

```
IQ = round(100 + 90 × (加权通过率 − 0.5))
```

| | |
| --- | --- |
| 量程 | 55–145 |
| 100 | 加权后对一半 |
| 半分 | 有卷面，不进 IQ（21 的 29、17 的 25） |
| 速度 | 只调卷面，不调 IQ |
| 同档 | 差 < 20 或 95% 区间重叠 |

```mermaid
flowchart LR
  A[填 Base URL + Key] --> B[拉模型 / 多路并行]
  B --> C[流式作答 xhigh]
  C --> D[抽取最终答案]
  D --> E[判分 + 速度系数]
  E --> F[IQ / 报告 / 画廊 / 榜]
  F --> G[渠道鉴定 + 降智对照]
```

## 渠道鉴定：这条渠道干净吗

主测评之后追加 15 个探针（可开关，**全部不计分**），把渠道的底细摸一遍：

| 探针 | 在查什么 | 输出 |
| --- | --- | --- |
| 知识阶梯 13 问 | 客观事件从 2023Q4 铺到 2026Q3，答对的最晚季度即训练截止 | `知识≈2025Q4（8/13）` |
| 联网嫌疑 | 顶格事件离测评日很近，训练数据不可能覆盖，答对即网关在偷偷搜索 | `⚠ 疑似联网` |
| juice 探针 | juice 是 Codex CLI 注入的推理参数，正经 API 渠道不会有 | `juice=128（疑似 Codex 反代）` |
| 身份自报 | 记录模型自称，仅供对照，不做判定 | `自称 gpt-5.2` |
| 降智对照 | 跟全网同名模型的公开分数分布比，样本 ≥5、低于中位 12 分且不超下四分位才指认 | `→ 疑似降智渠道` |

鉴定结果进成绩卡、HTML 报告和榜单：模型榜显示知识新旧（季度），渠道榜按主机聚合 ⚠ 联网 / juice / 降智标记，一眼看出哪家中转干净。

知识阶梯的事件表在 `src/lib/probes.ts`，会随时间过期——最新条目距今超 90 天时界面会提醒补新事件。

## 很快跑起来

```bash
git clone https://github.com/yclenove/iqbench.git
cd iqbench
npm install
npm run dev
```

浏览器打开 `http://localhost:8080`。

1. API Base URL 填到 `/v1`
2. Key 只在本标签页用，不要写进 `.env`
3. 拉模型 → 勾选 → 一键测评
4. 看成绩表、鹈鹕画廊、渠道鉴定，导出 HTML 报告

```bash
npm test           # 判分器 / 生成器 / 探针的真源码测试
npm run typecheck
npm run build && npm run preview
```

## 设计上的硬规矩

- **Key 不入库、不上报、不进 Git。** 默认 `sessionStorage`，关页即清。
- 思考级别固定 **xhigh**，流式输出；对话流 4 次退避重试，拉模型 / 云同步 / 对照拉取各带 3 次，云端写入幂等。
- 切 Key 换作用域：上一把的成绩不会串到下一把。
- 游客成绩留在这台浏览器；登录后才同步、才进公开模型榜 / 渠道榜。
- 画廊只认内联 SVG。思考过程里写到 canvas 不再误杀整题。
- 鉴定和对照只打标签，不碰 IQ、不碰卷面，指认阈值宁缺毋滥。

## 仓库里有什么

```
src/lib/questions.ts   题库、参数化、IQ 公式
src/lib/judge.ts       抽取、判分、鹈鹕 DOM 几何
src/lib/generators.ts  袜子 / 球拍 / 逻辑 / 排队求解器
src/lib/probes.ts      渠道鉴定：知识阶梯 / juice / 联网嫌疑
src/lib/bench-store.ts 本地存档、榜单聚合、降智指认
src/lib/bench-db.ts    云同步、公开榜、全网基线
src/lib/report.ts      导出的精美 HTML 报告
migrations/            数据库结构（两个后端自动套用）
scripts/verify-src.test.mjs  真源码打包直测，防测试漂移
docs/                  README 用的图
iqbench-spec.md        给外部模型 review 的完整规格
```

## 安全

不要提交 API Key、`.env`、测评原始日志。  
`.gitignore` 已排除 `.env*` 和本地产物。页面输入框才是放 Key 的地方。

## 许可

私人项目。未另声明前，不要公开发布别人的 Key 或渠道地址。

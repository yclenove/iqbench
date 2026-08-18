# IQBench · 模型智商测评台

给 OpenAI 兼容网关用的模型智商评测台：填 Base URL 和 Key，拉取模型，一键并行测评。

- 题库 bench v6.1（认知反射、最坏情况、抗记忆、鹈鹕 SVG 作图等）
- IQ 55–145，100 = 对一半
- Key 只留在浏览器标签页，不入库、不进 Git
- 可选登录后上公开模型榜 / 渠道榜

题库与判分见 [iqbench-spec.md](./iqbench-spec.md) 和 [public/iqbench-spec.md](./public/iqbench-spec.md)。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:8080`。测评 Key 在页面里填，不要写进 `.env`。

```bash
npm run build
npm run preview
```

## 安全

- 不要把 API Key、`.env`、测评原始日志提交到 Git
- `.gitignore` 已排除 `.env*`、`artifacts/`、沙箱内部文件
- 页面默认用 `sessionStorage`，关标签即清

## 许可

私人项目，未另声明前请勿公开发布他人的测评 Key 或渠道地址。

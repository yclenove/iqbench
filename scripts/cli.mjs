#!/usr/bin/env node
/**
 * 本地一键起测评台：npx github:yclenove/iqbench
 * Key 只经本机转发，不走托管站。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = join(root, "node_modules/vite/bin/vite.js");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, BROWSER: "none" },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

console.log("猛蹬·145  本地测评台");
console.log("浏览器 → 本机 :8080 → 你的网关。Key 不经过托管站。");
console.log("打开 http://127.0.0.1:8080\n");

if (!existsSync(viteBin)) {
  console.log("首次运行，安装依赖…");
  await run("npm", ["install", "--include=dev"]);
}

await run(process.execPath, [viteBin, "dev", "--host", "127.0.0.1", "--port", "8080"]);

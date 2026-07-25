/**
 * 自定义 server 的 preload 脚本。
 *
 * 必须通过 `--require ./preload.cjs` 在 tsx/server.ts 之前加载，解决两个问题：
 *
 * 1. 加载 `.env.local`
 *    标准 `next dev` 通过 webpack 的 DefinePlugin 自动加载 .env.local，
 *    但 `tsx watch server.ts` 不会。这里手动解析并注入 process.env。
 *
 * 2. 注入 `globalThis.AsyncLocalStorage`
 *    Next.js 15 的 AppRouter（app/api/auth/[...nextauth]/route.ts）内部模块
 *    `async-local-storage.js` 在模块加载时检查 globalThis.AsyncLocalStorage。
 *    标准 `next dev` 由 `node-environment-baseline.js` 在启动时注入；
 *    但自定义 server + tsx 时，ES module 的 import hoisting 导致
 *    `import next from 'next'` 在 `server.ts` 顶部的注入代码之前执行，
 *    所以 Next.js 模块加载时 AsyncLocalStorage 还不存在。
 *    通过 --require flag 在所有模块之前加载本文件可解决。
 */
const fs = require('fs');
const path = require('path');

// === 1. 加载 .env.local ===
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // 去掉首尾引号（单引号或双引号）
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        // 不覆盖已存在的环境变量（与 Next.js 行为一致，允许 .env.local 被外部 env 覆盖）
        if (!process.env[key]) process.env[key] = val;
    }
}

// === 2. 注入 AsyncLocalStorage ===
if (typeof globalThis.AsyncLocalStorage !== 'function') {
    globalThis.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
}

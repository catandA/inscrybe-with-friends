// 注意：.env.local 加载和 globalThis.AsyncLocalStorage 注入由 preload.cjs 通过
// `--require ./preload.cjs` flag 处理。不能在这里做，因为 ES module 的 import hoisting
// 会导致 `import next from 'next'` 在本文件的顶部代码之前执行。

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { setupSocketIO } from './server/socket';

/**
 * 自定义 Next.js 服务器入口。
 *
 * 替换原 `next dev` / `next start`，将 Socket.IO 挂载到同一 HTTP server：
 * - 所有 `/api/socket.io/*` 路径由 Socket.IO 处理（WebSocket 升级 + 长轮询回退）
 * - 其他路径全部转发给 Next.js 的 request handler
 *
 * 用 tsx 运行：`tsx watch server.ts`（dev）或 `tsx server.ts`（prod）。
 * 注意：自定义 server 不支持 Turbopack，dev 时会回退到 SWC。
 * 这是为了让 Socket.IO 与 Next.js 共享同一进程/端口的必要取舍。
 */
const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url ?? '/', true);
        handle(req, res, parsedUrl);
    });

    // 挂载 Socket.IO 到同一个 HTTP server
    setupSocketIO(httpServer);

    httpServer.listen(port, hostname);
    console.log(`> Ready on http://${hostname}:${port} (dev=${dev})`);
});

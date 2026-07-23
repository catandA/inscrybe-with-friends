import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// 注：不使用 vite-tsconfig-paths（v5 是 ESM-only，与本项目的 CJS 配置冲突）。
// 项目只有一个路径别名 `@/*` → `./*`（见 tsconfig.json），手动配置即可。
export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname),
        },
    },
    test: {
        // 引擎层是服务端纯逻辑，无需 DOM 环境
        environment: 'node',
        include: ['lib/**/*.test.ts', 'server/**/*.test.ts'],
        // TEST/ 和 reference/ 被 .gitignore 忽略（单机参考资料），不纳入测试
        exclude: ['node_modules', '.next', 'TEST', 'reference', 'dist'],
    },
});

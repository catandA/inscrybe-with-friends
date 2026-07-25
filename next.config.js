/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['cdn.discordapp.com'],
    },
    reactStrictMode: true,

    transpilePackages: ['next-auth', 'tone'],
    webpack: (config, { isServer }) => {
        config.module.rules.push({
            test: /\.lua$/,
            use: 'raw-loader',
        });

        // tone v14 的 package.json 有 "browser": "build/Tone.js"（UMD 构建）。
        // webpack 5 在浏览器上下文优先用 browser 字段，但 UMD 是 module.exports = Tone，
        // 没有 start/Sampler 等 named exports，导致 `import * as Tone` + `Tone.start()` 报
        // "Attempted import error: 'start' is not exported from 'tone'"。
        // 强制 webpack 解析到 ESM 入口（build/esm/index.js），那里有正确的命名导出。
        config.resolve = config.resolve || {};
        config.resolve.alias = config.resolve.alias || {};
        config.resolve.alias.tone = require.resolve('tone/build/esm/index.js');

        if (isServer) {
            config.devtool = 'source-map';
        }

        return config;
    },
    turbopack: {
        resolveAlias: {
            // tone 的 package.json browser 字段指向 UMD 构建 (build/Tone.js)，
            // Turbopack 按 ESM 分析时找不到导出。强制浏览器上下文解析到 ESM 构建。
            tone: { browser: 'tone/build/esm/index.js' },
        },
        rules: {
            '*.lua': {
                loaders: ['raw-loader'],
                as: '*.js',
            },
        },
    },
};

module.exports = nextConfig;

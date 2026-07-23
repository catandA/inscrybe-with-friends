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

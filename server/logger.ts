export type LogContext = Partial<{
    gameId: string;
    lobbyId: string;
    userId: string;
    rulesetId: string;
    syntheticKey: string;
}>;
export type LogEvent = {
    message: string;
    level?: 'info' | 'warn' | 'error' | 'debug' | 'verbose';
} & LogContext;

const levelToConsole = {
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    verbose: console.debug,
} as const;

const formatCtx = (ctx?: LogContext) => ctx && Object.keys(ctx).length > 0 ? ' ' + JSON.stringify(ctx) : '';

export const logger = {
    log: (message: string, { ctx, level = 'info' }: { ctx?: LogContext, level?: LogEvent['level'] }) => {
        levelToConsole[level](`[${level}] ${message}${formatCtx(ctx)}`);
    },
    info: (message: string, ctx?: LogContext) => logger.log(message, { ctx, level: 'info' }),
    warn: (message: string, ctx?: LogContext) => logger.log(message, { ctx, level: 'warn' }),
    error: (message: string, ctx?: LogContext) => logger.log(message, { ctx, level: 'error' }),
    debug: (message: string, ctx?: LogContext) => logger.log(message, { ctx, level: 'debug' }),
    verbose: (message: string, ctx?: LogContext) => logger.log(message, { ctx, level: 'verbose' }),

    flush: async () => {
        // 本地 console 日志即时输出，无需 flush
    },
};

import { PrismaClient, Prisma } from '@prisma/client';

// This jank is needed for dev server or else old prisma connection will still exist in memory after hot reloads
// https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices

const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    // Phase 6.5：配置日志，只报 error 级别的数据库问题
    log: [{ level: 'error', emit: 'stdout' }],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Phase 6.5：Prisma 查询重试包装（共享工具）。
 *
 * Postgres 重启、空闲连接被服务器关闭、网络抖动等场景下，Prisma 客户端连接池里
 * 会残留失效连接，下次查询报 P1001（连不上）/ P1017（服务器关闭连接）/
 * P1002（超时）。本函数捕获这些错误，先 $disconnect() 清理整个连接池，
 * 再 $connect() 重建，然后重试一次。只重试一次避免死循环；重试仍失败抛原始错误。
 *
 * 用法：所有认证路径上的 prisma 查询都应包一层 withRetry。
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            // P1001: 连不上数据库；P1017: 服务器关闭连接；P1002: 请求超时
            if (e.code === 'P1001' || e.code === 'P1017' || e.code === 'P1002') {
                console.warn(`[prisma] ${e.code} - reconnecting and retrying once...`);
                try {
                    await prisma.$disconnect();
                } catch {
                    // disconnect 失败不阻塞重连流程
                }
                await prisma.$connect();
                return await fn();
            }
        }
        throw e;
    }
}

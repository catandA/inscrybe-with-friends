import { Server as IOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { FightPacket } from '@/lib/engine/Tick';
import { getToken } from 'next-auth/jwt';
import { prisma } from './db';

let io: IOServer | null = null;

/**
 * 初始化 Socket.IO 服务，挂载到 Next.js HTTP server。
 *
 * 替换原 Pusher 方案：国内用户走 WebSocket 直连，无 Pusher 云中转。
 * 鉴权用 next-auth/jwt 的 getToken 从 cookie 解 JWT，用户身份由 token.sub 标识，
 * 不再需要像 Pusher 那样的 socket_id/channel_name 签名流程。
 *
 * 房间映射（对应原 Pusher 频道）：
 * - `user:{userId}` —— 个人房间，对应原 user channel（接收 game-packet / game-end）
 * - `lobby:{lobbyId}` —— 大厅房间，对应原 `private-lobby@{id}`（接收 refetch / game-start）
 * - `spectate:{gameId}` —— 观战房间，对应原 `private-spectate@{gameId}`
 */
export async function setupSocketIO(httpServer: HTTPServer) {
    io = new IOServer(httpServer, {
        path: '/api/socket.io',
        cors: { origin: true, credentials: true },
    });

    // 鉴权中间件：用 next-auth/jwt 的 getToken 从 cookie 解 JWT。
    // 不能用 auth(req, res)：NextAuth v5 的 auth() 期望 Web API Request/Response，
    // Socket.IO 的 socket.request 是 Node.js IncomingMessage，传进去会抛
    // "response.appendHeader is not a function"。
    // getToken 原生支持 IncomingMessage，直接读 cookie 解 JWT，不依赖 Response 对象。
    io.use(async (socket: Socket, next) => {
        try {
            const token = await getToken({
                req: socket.request as any,
                secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
            });
            if (!token?.sub) {
                return next(new Error('UNAUTHORIZED'));
            }
            socket.data.userId = token.sub;
            socket.data.name = token.name;
            socket.data.image = token.picture;
            next();
        } catch (err) {
            next(err as Error);
        }
    });

    io.on('connection', (socket: Socket) => {
        const userId = socket.data.userId as string;
        // 自动加入个人房间（替代 Pusher user channel 的 signin 流程）
        socket.join(`user:${userId}`);

        // 大厅房间：客户端显式 emit('lobby:join', lobbyId) 加入
        // 服务端校验 lobby 存在（与原 tRPC pusher.authorize 一致）
        socket.on('lobby:join', async (lobbyId: string, ack?: () => void) => {
            const lobby = await prisma.lobby.findFirst({ where: { id: lobbyId } });
            if (lobby) socket.join(`lobby:${lobbyId}`);
            ack?.();
        });
        socket.on('lobby:leave', (lobbyId: string) => {
            socket.leave(`lobby:${lobbyId}`);
        });

        // 观战房间：与 lobby 同理，校验 game 存在
        // 不强制要求观战者是 lobby 成员——任何已登录用户都可观战（与原 tRPC 实现一致）
        socket.on('spectate:join', async (gameId: string, ack?: () => void) => {
            const game = await prisma.game.findFirst({ where: { id: gameId } });
            if (game) socket.join(`spectate:${gameId}`);
            ack?.();
        });
        socket.on('spectate:leave', (gameId: string) => {
            socket.leave(`spectate:${gameId}`);
        });
    });
}

export function getIO(): IOServer | null {
    // Next.js dev 模式：API routes 跑在 render worker 子进程，主进程 server.ts
    // 调的 setupSocketIO 只设了主进程的 io 变量，worker 进程的 io 永远是 null。
    // 不再抛错——trigger 函数会检查返回值并容错跳过。prod 模式无 worker 隔离问题。
    return io;
}

// === Trigger functions（与原 server/pusher.ts 同名同签名，平滑替换调用方） ===
//
// 所有 trigger 在 io=null（Next.js dev worker 进程）时静默跳过——
// 通知失败只是某个客户端收不到实时推送，不应让 mutation 报错。
// prod 模式 io 一定非 null（setupSocketIO 在主进程已调用）。

export function triggerLobbyRefetch(lobbyId: string, fromUser?: string) {
    getIO()?.to(`lobby:${lobbyId}`).emit('lobby:refetch', { from: fromUser });
}

export function triggerLobbyGameStart(lobbyId: string) {
    getIO()?.to(`lobby:${lobbyId}`).emit('lobby:game-start', {});
}

export function triggerFightPacket(toUser: string, gameId: string, packet: FightPacket) {
    getIO()?.to(`user:${toUser}`).emit('game-packet', {
        gameId,
        packet,
    } satisfies UserGamePacket);
}

export function triggerGameEnd(toUser: string, gameId: string, message: string) {
    getIO()?.to(`user:${toUser}`).emit('game-end', {
        gameId,
        message,
    } satisfies GameEndMessage);
}

/**
 * Phase 4 观战模式：向 `spectate:{gameId}` 房间推送 packet。
 * 与 triggerFightPacket（走个人房间，仅限具体玩家）不同，
 * 观战房间内所有订阅者都收到。事件名与个人房间一致（'game-packet'）。
 */
export function triggerSpectatorPacket(gameId: string, packet: FightPacket) {
    getIO()?.to(`spectate:${gameId}`).emit('game-packet', {
        gameId,
        packet,
    } satisfies SpectatorGamePacket);
}

/** Phase 4 观战模式：向观战房间推送游戏结束消息。 */
export function triggerSpectatorGameEnd(gameId: string, message: string) {
    getIO()?.to(`spectate:${gameId}`).emit('game-end', {
        gameId,
        message,
    } satisfies GameEndMessage);
}

// === 类型导出（与原 server/pusher.ts 兼容，方便调用方 import 不变） ===

export type LobbyGameEnd = {
    message: string;
};

export type UserGamePacket = {
    gameId: string;
    packet: FightPacket;
};

export type SpectatorGamePacket = {
    gameId: string;
    packet: FightPacket;
};

export type GameEndMessage = {
    gameId: string;
    message: string;
};

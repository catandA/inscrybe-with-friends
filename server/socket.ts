import { Server as IOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { FightPacket } from '@/lib/engine/Tick';
import { getToken } from 'next-auth/jwt';
import { prisma } from './db';

// io 实例通过 globalThis 共享，不能只用模块级变量。
// 原因：自定义 server 模式下，server.ts 由 tsx 运行原始 .ts，API routes 由
// webpack 打包成 bundle，两边 import 的 server/socket.ts 是不同模块实例，
// 各有独立的 let io 变量。setupSocketIO 设置的是 tsx 实例的 io，API route
// bundle 里 getIO() 读的是 webpack 实例的 io，永远是 null，导致所有
// trigger* 调用静默跳过。globalThis 在主进程内共享，可绕过模块实例隔离。
type GlobalWithIo = typeof globalThis & { __socketIO?: IOServer | null };
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
 * - `lobby:{lobbyId}` —— 大厅房间，对应原 `private-lobby@{id}`（接收 refetch / game-start / chat）
 * - `spectate:{gameId}` —— 观战房间，对应原 `private-spectate@{gameId}`
 * - `game:{gameId}` —— 对局聊天房间（玩家 + 观战者都加入，接收 game:chat）
 *
 * 全局广播（无房间，io.emit）：
 * - `lobby-list:refetch` —— 公开大厅列表变化时通知所有用户重拉 listPublic
 */
export async function setupSocketIO(httpServer: HTTPServer) {
    io = new IOServer(httpServer, {
        path: '/api/socket.io',
        cors: { origin: true, credentials: true },
    });
    (globalThis as GlobalWithIo).__socketIO = io;

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

        // 对局聊天房间：玩家与观战者都加入，game:chat 事件广播到此房间。
        // 与 spectate:{gameId} 分开，因为 spectate 房间只推 packet，
        // 不应让观战者通过订阅 packet 来收聊天（语义混淆）。
        // 校验 game 存在；不强制是参与者，观战者也可加入聊天。
        socket.on('game:join', async (gameId: string, ack?: () => void) => {
            const game = await prisma.game.findFirst({ where: { id: gameId } });
            if (game) socket.join(`game:${gameId}`);
            ack?.();
        });
        socket.on('game:leave', (gameId: string) => {
            socket.leave(`game:${gameId}`);
        });
    });
}

export function getIO(): IOServer | null {
    // 优先读模块级变量（同实例），否则从 globalThis 读（跨模块实例共享）。
    // 自定义 server 模式下 server.ts 与 API route bundle 是不同模块实例，
    // 但都在主进程内执行，globalThis 共享。
    if (io) return io;
    return (globalThis as GlobalWithIo).__socketIO ?? null;
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

/**
 * 公开大厅列表变更：广播给所有已连接客户端。
 * 客户端收到后重拉 trpc.lobbies.listPublic。
 *
 * 触发场景：lobby 创建/删除、isPublic 切换、lobby 名称变更。
 * 不能增量推送——客户端持有的是 listPublic 查询结果，必须用 refetch 来重算。
 */
export function triggerLobbyListRefetch() {
    getIO()?.emit('lobby-list:refetch', {});
}

/**
 * 大厅聊天：向 `lobby:{lobbyId}` 房间推送新消息。
 * 客户端订阅后追加到本地消息列表，无需重拉 history。
 */
export function triggerLobbyChat(lobbyId: string, message: ChatMessagePayload) {
    getIO()?.to(`lobby:${lobbyId}`).emit('lobby:chat', message);
}

/**
 * 对局聊天：向 `game:{gameId}` 房间推送新消息。
 * 玩家和观战者都加入此房间，因此都能收到。
 */
export function triggerGameChat(gameId: string, message: ChatMessagePayload) {
    getIO()?.to(`game:${gameId}`).emit('game:chat', message);
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

/**
 * 聊天消息载荷。客户端用此类型渲染消息列表，不直接渲染 Prisma 模型。
 * - id：消息 id（用于 React key 与去重）
 * - userId / name / image：发送者标识与展示信息
 * - content：消息正文
 * - createdAt：ISO 时间字符串（Date.toISOString()）
 */
export type ChatMessagePayload = {
    id: string;
    userId: string;
    name: string;
    image: string;
    content: string;
    createdAt: string;
};

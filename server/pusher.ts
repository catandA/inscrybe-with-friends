import { FightPacket } from '@/lib/engine/Tick';
import PusherServer from 'pusher';

export const pusherServer = new PusherServer({
    appId: process.env.PUSHER_APP_ID,
    secret: process.env.PUSHER_SECRET,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true,
});

export function triggerLobbyRefetch(lobbyId: string, fromUser?: string) {
    pusherServer.trigger(`private-lobby@${lobbyId}`, 'refetch', {
        from: fromUser,
    });
}
export function triggerLobbyGameStart(lobbyId: string) {
    pusherServer.trigger(`private-lobby@${lobbyId}`, 'game-start', {});
}

export function triggerFightPacket(toUser: string, gameId: string, packet: FightPacket) {
    pusherServer.sendToUser(toUser, 'game-packet', {
        gameId,
        packet,
    } satisfies UserGamePacket);
}

export function triggerGameEnd(toUser: string, gameId: string, message: string) {
    pusherServer.sendToUser(toUser, 'game-end', {
        gameId,
        message,
    } satisfies GameEndMessage);
}

/**
 * Phase 4 观战模式：向 `private-spectate@{gameId}` 频道推送 packet。
 *
 * 与 triggerFightPacket（走 Pusher user channel，仅限具体玩家）不同，
 * 观战频道是 private channel，所有订阅该频道的观战者都能收到。
 * 事件名与 user channel 一致（'game-packet'），客户端用相同的 listener 结构。
 */
export function triggerSpectatorPacket(gameId: string, packet: FightPacket) {
    pusherServer.trigger(`private-spectate@${gameId}`, 'game-packet', {
        gameId,
        packet,
    } satisfies SpectatorGamePacket);
}

/**
 * Phase 4 观战模式：向观战频道推送游戏结束消息。
 */
export function triggerSpectatorGameEnd(gameId: string, message: string) {
    pusherServer.trigger(`private-spectate@${gameId}`, 'game-end', {
        gameId,
        message,
    } satisfies GameEndMessage);
}

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

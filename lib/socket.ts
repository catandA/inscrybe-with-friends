import { io, Socket } from 'socket.io-client';
import type { GameEndMessage, UserGamePacket, SpectatorGamePacket } from '@/server/socket';
import { FightPacket } from './engine/Tick';

/**
 * Socket.IO 客户端单例。
 *
 * 与服务端同源（避免 CORS），path 为 `/api/socket.io`。
 * 鉴权走同源 cookie（withCredentials），不再需要像 Pusher 那样单独 authenticate。
 * `autoConnect: false` 让 _app.tsx 在登录后再手动 connect。
 *
 * transports: ['websocket', 'polling']
 *   优先 WebSocket（低延迟），失败自动降级到 polling（兼容性高）。
 *   国内公网环境常出现 WebSocket upgrade 被 ISP/云网络设备重置，
 *   降级到 polling 保证基本可用性（延迟略高但功能完整）。
 */
export const socketClient: Socket = io({
    path: '/api/socket.io',
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
});

/**
 * 订阅当前用户的 game-packet 事件（对应原 Pusher user channel）。
 * 服务端通过 `triggerFightPacket(toUser=userId, ...)` 推送给个人房间。
 */
export function subscribeGamePacket(gameId: string, onPacket: (packet: FightPacket) => void) {
    const listener = (data: UserGamePacket) => {
        if (data.gameId === gameId) onPacket(data.packet);
    };
    socketClient.on('game-packet', listener);
    return () => void socketClient.off('game-packet', listener);
}

/** 订阅当前用户的 game-end 事件。 */
export function subscribeGameEnd(gameId: string, onEnd: (message: string) => void) {
    const listener = (data: GameEndMessage) => {
        if (data.gameId === gameId) onEnd(data.message);
    };
    socketClient.on('game-end', listener);
    return () => void socketClient.off('game-end', listener);
}

/**
 * Phase 4 观战模式：订阅 spectate 房间（对应原 `private-spectate@{gameId}`）。
 * 多个观战者可同时订阅。服务端通过 `triggerSpectatorPacket` 推送给房间内所有连接。
 */
export function subscribeSpectatorPacket(gameId: string, onPacket: (packet: FightPacket) => void) {
    socketClient.emit('spectate:join', gameId);
    const listener = (data: SpectatorGamePacket) => {
        if (data.gameId === gameId) onPacket(data.packet);
    };
    socketClient.on('game-packet', listener);
    return () => {
        socketClient.off('game-packet', listener);
        socketClient.emit('spectate:leave', gameId);
    };
}

export function subscribeSpectatorGameEnd(gameId: string, onEnd: (message: string) => void) {
    socketClient.emit('spectate:join', gameId);
    const listener = (data: GameEndMessage) => {
        if (data.gameId === gameId) onEnd(data.message);
    };
    socketClient.on('game-end', listener);
    return () => {
        socketClient.off('game-end', listener);
        socketClient.emit('spectate:leave', gameId);
    };
}

/**
 * 大厅订阅辅助（用于 lobby/index.tsx）。
 * 替代原 `pusherClient.subscribe('private-lobby@' + lobbyId)` + `channel.bind('refetch'/'game-start')`。
 */
export function subscribeLobby(lobbyId: string, handlers: {
    onRefetch?: (from: string | undefined) => void;
    onGameStart?: () => void;
}) {
    socketClient.emit('lobby:join', lobbyId);
    const refetchListener = (data: { from?: string }) => handlers.onRefetch?.(data.from);
    const gameStartListener = () => handlers.onGameStart?.();
    socketClient.on('lobby:refetch', refetchListener);
    socketClient.on('lobby:game-start', gameStartListener);
    return () => {
        socketClient.off('lobby:refetch', refetchListener);
        socketClient.off('lobby:game-start', gameStartListener);
        socketClient.emit('lobby:leave', lobbyId);
    };
}

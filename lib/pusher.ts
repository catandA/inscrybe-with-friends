import PusherClient from 'pusher-js';
import { trpcProxy } from './trpc';
import type { GameEndMessage, UserGamePacket, SpectatorGamePacket } from '@/server/pusher';
import { FightPacket } from './engine/Tick';

export const pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    channelAuthorization: {
        endpoint: '',
        transport: 'ajax',
        customHandler: async (channelInfo, callback) => {
            trpcProxy.pusher.authorize.query(channelInfo)
                .then(auth => callback(null, auth))
                .catch(err => callback(err, null));
        },
    },
    userAuthentication: {
        endpoint: '',
        transport: 'ajax',
        customHandler: async ({ socketId }, callback) => {
            trpcProxy.pusher.authenticate.query({ socketId })
                .then(auth => callback(null, auth))
                .catch(err => callback(err, null));
        },
    },
});

export function subscribeGamePacket(gameId: string, onPacket: (packet: FightPacket) => void) {
    const listener = (data: UserGamePacket) => {
        if (data.gameId === gameId) onPacket(data.packet);
    };
    pusherClient.user.bind('game-packet', listener);
    return () => void pusherClient.user.unbind('game-packet', listener);
}

export function subscribeGameEnd(gameId: string, onEnd: (message: string) => void) {
    const listener = (data: GameEndMessage) => {
        if (data.gameId === gameId) onEnd(data.message);
    };
    pusherClient.user.bind('game-end', listener);
    return () => void pusherClient.user.unbind('game-end', listener);
}

/**
 * Phase 4 观战模式：订阅 `private-spectate@{gameId}` 频道。
 *
 * 与 subscribeGamePacket（走 user channel）不同，观战频道是 private channel，
 * 多个观战者可同时订阅。服务端通过 triggerSpectatorPacket 推送。
 */
export function subscribeSpectatorPacket(gameId: string, onPacket: (packet: FightPacket) => void) {
    const channelId = `private-spectate@${gameId}`;
    const channel = pusherClient.subscribe(channelId);
    const listener = (data: SpectatorGamePacket) => {
        if (data.gameId === gameId) onPacket(data.packet);
    };
    channel.bind('game-packet', listener);
    return () => {
        channel.unbind('game-packet', listener);
        pusherClient.unsubscribe(channelId);
    };
}

/**
 * Phase 4 观战模式：订阅观战频道的游戏结束事件。
 */
export function subscribeSpectatorGameEnd(gameId: string, onEnd: (message: string) => void) {
    const channelId = `private-spectate@${gameId}`;
    const channel = pusherClient.subscribe(channelId);
    const listener = (data: GameEndMessage) => {
        if (data.gameId === gameId) onEnd(data.message);
    };
    channel.bind('game-end', listener);
    return () => {
        channel.unbind('game-end', listener);
        pusherClient.unsubscribe(channelId);
    };
}

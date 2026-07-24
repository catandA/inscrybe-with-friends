import { Action, ActionRes, PlayerMessage } from '@/lib/engine/Actions';
import { FightHost, createTick } from '@/lib/engine/Host';
import { FightPacket, FightTick, handleAction, handleEvents, handleResponse, startGame, translatePacket } from '@/lib/engine/Tick';
import { Rng } from '@/lib/engine/Rng';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useClientStore } from './useClientStore';
import { clone } from '@/lib/utils';
import { FightSide } from '@/lib/engine/Fight';
import { Event, translateEvent } from '@/lib/engine/Events';
import { pick } from 'lodash';
import { trpcProxy } from '@/lib/trpc';

interface LocalGame {
    host: FightHost,
    forceTranslate?: FightSide,
}
interface CloudGame {
    playedInit: boolean,
    /**
     * Phase 4 断线重连：记录客户端最后看到的 packet id。
     * 由 handleCloudPacket 在收到服务端推送时更新（通过查询 game.get 返回的 lastPacketId 比对）。
     * 重连时用此值调用 getPacketsSince 拉取错过的 packet。
     */
    lastSeenPacketId?: string,
}
/**
 * Phase 4 观战模式：观战者侧的游戏状态。
 * 与 CloudGame 类似但只读——观战者不能发送 action/response。
 */
interface SpectatorGame {
    playedInit: boolean,
    lastSeenPacketId?: string,
}
/**
 * Phase 4 回放系统：回放会话状态。
 * - packets：从服务端拉取的全部 packet（已 translateEvent 到 player 视角）
 * - cursor：当前播放到第几个 packet（-1 表示尚未开始）
 * - playing：是否自动播放
 */
interface ReplayGame {
    packets: { id: string, packet: FightPacket }[],
    cursor: number,
    playing: boolean,
}
interface GameStore {
    localGames: Partial<Record<string, LocalGame>>,
    newLocalGame(gameId: string, host: FightHost): void,
    setLocalGame(gameId: string, mutator: (state: LocalGame) => LocalGame): void,
    saveHost(gameId: string): void,
    deleteLocalGame(gameId: string): void,

    createTick(gameId: string): FightTick,
    startHost(gameId: string): Promise<void>,
    sendLocalAction(gameId: string, action: Action): Promise<void>,
    sendLocalResponse(gameId: string, res: ActionRes): Promise<void>,
    createEvent(gameId: string, event: Event): Promise<void>,

    cloudGames: Partial<Record<string, CloudGame>>,
    newCloudGame(gameId: string): void,
    getCloudGame(gameId: string, createIfNone: true): CloudGame,
    getCloudGame(gameId: string, createIfNone?: boolean): CloudGame | null,
    setCloudGame(gameId: string, mutator: (state: CloudGame) => CloudGame): void,
    deleteCloudGame(gameId: string): void,
    handleCloudPacket(gameId: string, packet: FightPacket): void,
    /** Phase 4 断线重连：记录最后看到的 packet id */
    markCloudPacketSeen(gameId: string, packetId: string): void,

    // Phase 4 观战模式
    spectatorGames: Partial<Record<string, SpectatorGame>>,
    newSpectatorGame(gameId: string): void,
    getSpectatorGame(gameId: string, createIfNone: true): SpectatorGame,
    getSpectatorGame(gameId: string, createIfNone?: boolean): SpectatorGame | null,
    setSpectatorGame(gameId: string, mutator: (state: SpectatorGame) => SpectatorGame): void,
    deleteSpectatorGame(gameId: string): void,
    handleSpectatorPacket(gameId: string, packet: FightPacket): void,
    /** Phase 4 观战断线重连：记录最后看到的 packet id */
    markSpectatorPacketSeen(gameId: string, packetId: string): void,

    // Phase 4 回放系统
    replayGames: Partial<Record<string, ReplayGame>>,
    newReplayGame(gameId: string, packets: { id: string, packet: FightPacket }[]): void,
    setReplayGame(gameId: string, mutator: (state: ReplayGame) => ReplayGame): void,
    deleteReplayGame(gameId: string): void,
    /** 回放推进一步：把下一个 packet 喂给 client store */
    stepReplay(gameId: string): void,
    /** 回放跳转到指定 packet 索引（重建 client） */
    seekReplay(gameId: string, cursor: number): void,
    setReplayPlaying(gameId: string, playing: boolean): void,

    sendPlayerMessage(gameId: string, message: PlayerMessage): Promise<void>,
}

export const useGameStore = create(
    persist<GameStore>(
        (set, get) => ({
            // Local Game
            localGames: {},
            saveHost: (gameId) => {
                const game = get().localGames[gameId];
                if (!game) throw new Error('Missing local game!');
                get().setLocalGame(gameId, oldGame => ({ ...oldGame, host: clone(game.host) }));
            },
            newLocalGame: (gameId, host) => set(state => ({ localGames: { ...state.localGames, [gameId]: { host } } })),
            setLocalGame: (gameId, mutator) => set(state => {
                const game = state.localGames[gameId];
                if (!game) return state;
                return { localGames: { ...state.localGames, [gameId]: mutator(game) } };
            }),
            deleteLocalGame: (gameId) => set(state => {
                const games = { ...state.localGames };
                delete games[gameId];
                return { localGames: games };
            }),

            createTick: (gameId) => {
                const host = get().localGames[gameId]?.host;
                if (!host) throw new Error('Missing local game!');
                const rng = Rng.resume(host.rngState);
                return createTick(host, {
                    rng,
                    adapter: {
                        async initDeck(side, deck) {
                            const idxs = this.fight.decks[side][deck].map((_, idx) => idx);
                            return this.rng.shuffle(idxs);
                        },
                    },
                    logger: {
                        error: (message) => console.error(`[${gameId}] ${message}`),
                        debug: (message) => console.debug(`[${gameId}] ${message}`),
                        info: (message) => console.info(`[${gameId}] ${message}`),
                        warn: (message) => console.warn(`[${gameId}] ${message}`),
                    },
                });
            },
            startHost: async (gameId) => {
                const game = get().localGames[gameId]!;
                const tick = get().createTick(gameId);
                if (!tick) throw new Error('Missing server!');
                const side = game.forceTranslate ?? 'player';
                const packet = translatePacket(await startGame(tick), side);
                get().saveHost(gameId);
                useClientStore.getState().addPacket(gameId, packet);
            },
            sendLocalAction: async (gameId, action) => {
                const game = get().localGames[gameId]!;
                const tick = get().createTick(gameId);
                if (!tick) throw new Error('Missing server!');
                const side = game.forceTranslate ?? 'player';
                const packet = translatePacket(await handleAction(tick, side, action), side);
                get().saveHost(gameId);
                useClientStore.getState().addPacket(gameId, packet);
            },
            sendLocalResponse: async (gameId, res) => {
                const game = get().localGames[gameId]!;
                const tick = get().createTick(gameId);
                if (!tick) throw new Error('Missing server!');
                const side = game.forceTranslate ?? 'player';
                const packet = translatePacket(await handleResponse(tick, side, res), side);
                get().saveHost(gameId);
                useClientStore.getState().addPacket(gameId, packet);
            },
            createEvent: async (gameId, event) => {
                const game = get().localGames[gameId]!;
                const tick = get().createTick(gameId);
                if (!tick) throw new Error('Missing server!');
                const side = game.forceTranslate ?? 'player';
                const packet = translatePacket(await handleEvents(tick, [translateEvent(event, side, false)]), side);
                get().saveHost(gameId);
                useClientStore.getState().addPacket(gameId, packet);
            },

            // Cloud Game
            cloudGames: {},
            newCloudGame: (gameId) => set(state => ({
                cloudGames: {
                    ...state.cloudGames,
                    [gameId]: { playedInit: false },
                },
            })),
            getCloudGame: ((gameId, createIfNone) => {
                const game = get().cloudGames[gameId] ?? null;
                if (!game && createIfNone) {
                    get().newCloudGame(gameId);
                    return get().cloudGames[gameId]!;
                }
                return game;
            }) as GameStore['getCloudGame'],
            setCloudGame: (gameId, mutator) => set(state => {
                const game = state.cloudGames[gameId];
                if (!game) return state;
                return { ...state, cloudGames: { ...state.cloudGames, [gameId]: mutator(game) } };
            }),
            deleteCloudGame: (gameId) => set(state => {
                const games = { ...state.cloudGames };
                delete games[gameId];
                return { ...state, cloudGames: games };
            }),
            handleCloudPacket: (gameId, packet) => {
                const game = get().cloudGames[gameId];
                // TODO: use packet id as nonce
                if (!game) return;
                if (!game.playedInit) get().setCloudGame(gameId, oldGame => ({ ...oldGame, playedInit: true }));
                useClientStore.getState().addPacket(gameId, packet);
            },
            markCloudPacketSeen: (gameId, packetId) => {
                const game = get().cloudGames[gameId];
                if (!game) return;
                get().setCloudGame(gameId, oldGame => ({ ...oldGame, lastSeenPacketId: packetId }));
            },

            // Phase 4 观战模式
            spectatorGames: {},
            newSpectatorGame: (gameId) => set(state => ({
                spectatorGames: {
                    ...state.spectatorGames,
                    [gameId]: { playedInit: false },
                },
            })),
            getSpectatorGame: ((gameId, createIfNone) => {
                const game = get().spectatorGames[gameId] ?? null;
                if (!game && createIfNone) {
                    get().newSpectatorGame(gameId);
                    return get().spectatorGames[gameId]!;
                }
                return game;
            }) as GameStore['getSpectatorGame'],
            setSpectatorGame: (gameId, mutator) => set(state => {
                const game = state.spectatorGames[gameId];
                if (!game) return state;
                return { ...state, spectatorGames: { ...state.spectatorGames, [gameId]: mutator(game) } };
            }),
            deleteSpectatorGame: (gameId) => set(state => {
                const games = { ...state.spectatorGames };
                delete games[gameId];
                return { ...state, spectatorGames: games };
            }),
            handleSpectatorPacket: (gameId, packet) => {
                const game = get().spectatorGames[gameId];
                if (!game) return;
                if (!game.playedInit) get().setSpectatorGame(gameId, oldGame => ({ ...oldGame, playedInit: true }));
                useClientStore.getState().addPacket(gameId, packet);
            },
            markSpectatorPacketSeen: (gameId, packetId) => {
                const game = get().spectatorGames[gameId];
                if (!game) return;
                get().setSpectatorGame(gameId, oldGame => ({ ...oldGame, lastSeenPacketId: packetId }));
            },

            // Phase 4 回放系统
            replayGames: {},
            newReplayGame: (gameId, packets) => set(state => ({
                replayGames: {
                    ...state.replayGames,
                    [gameId]: { packets, cursor: -1, playing: false },
                },
            })),
            setReplayGame: (gameId, mutator) => set(state => {
                const game = state.replayGames[gameId];
                if (!game) return state;
                return { ...state, replayGames: { ...state.replayGames, [gameId]: mutator(game) } };
            }),
            deleteReplayGame: (gameId) => set(state => {
                const games = { ...state.replayGames };
                delete games[gameId];
                return { ...state, replayGames: games };
            }),
            stepReplay: (gameId) => {
                const game = get().replayGames[gameId];
                if (!game) return;
                const next = game.cursor + 1;
                if (next >= game.packets.length) {
                    // 已到末尾，停止自动播放
                    get().setReplayGame(gameId, g => ({ ...g, playing: false }));
                    return;
                }
                const nextPacket = game.packets[next].packet;
                useClientStore.getState().addPacket(gameId, nextPacket);
                get().setReplayGame(gameId, g => ({ ...g, cursor: next }));
            },
            seekReplay: (gameId, cursor) => {
                // 跳转：需要重置 client 并从开始重放到 cursor。
                // 实现方式：删除现有 client，由调用方重新创建 client 后逐个喂 packet。
                // 这里只更新 cursor 状态；实际重放由调用方驱动。
                get().setReplayGame(gameId, g => ({ ...g, cursor: Math.max(-1, Math.min(cursor, g.packets.length - 1)) }));
            },
            setReplayPlaying: (gameId, playing) => {
                get().setReplayGame(gameId, g => ({ ...g, playing }));
            },

            // All
            sendPlayerMessage: (gameId, message) => {
                const state = get();
                if (state.localGames[gameId]) {
                    return message.type === 'action'
                        ? state.sendLocalAction(gameId, message.action)
                        : state.sendLocalResponse(gameId, message.res);
                } else if (state.cloudGames[gameId]) {
                    return trpcProxy.game.actionMessage.mutate({
                        gameId,
                        data: message,
                    });
                }
                throw new Error('Missing game!');
            },
        }),
        {
            name: 'games',
            storage: createJSONStorage(() => localStorage),
            // 不持久化 replayGames/spectatorGames——它们是会话级状态，
            // 刷新后应重新拉取。localGames/cloudGames 持久化以支持断线重连。
            partialize: state => pick(state, ['localGames', 'cloudGames']) as GameStore,
        },
    )
);

import { z } from 'zod';
import { downConcurrency, protectedProcedure, router, upConcurrency } from '.';
import { TRPCError } from '@trpc/server';
import { prisma } from '../db';
import { defaultFightOptions, zDeckCards, zFightOptions, zFightSide, zFightSides, zPlayerMessage } from '@/lib/online/z';
import { kv } from '../kv';
import { FightHost, createFightHost, createTick } from '@/lib/engine/Host';
import { FIGHT_SIDES, FightSide, createFight, translateFight, translateFightForSpectator } from '@/lib/engine/Fight';
import { FightPacket, handleAction, handleResponse, startGame, translatePacket, translatePacketForSpectator } from '@/lib/engine/Tick';
import { Event, translateEvent } from '@/lib/engine/Events';
import { Rng } from '@/lib/engine/Rng';
import { clone, entries, fromEntries } from '@/lib/utils';
import { Prisma } from '@prisma/client';
import { triggerFightPacket, triggerGameEnd, triggerLobbyGameStart, triggerLobbyRefetch, triggerSpectatorPacket, triggerSpectatorGameEnd } from '../socket';
import { LogContext, logger } from '../logger';
import { randomUUID } from 'crypto';
import {
    getMergedRuleset,
    isRegisteredRuleset,
    isUserRulesetKey,
    extractUserRulesetId,
    registerRuleset,
    userRulesetKey,
} from '@/lib/defs/prints';
import type { UserRulesetData } from '@/lib/engine/Card';

/**
 * Phase 3.4：确保用户 ruleset 已注册到运行时 rulesets map。
 *
 * 如果 host.fight.opts.ruleset 是 `user:UUID` 格式且尚未注册，
 * 从 DB 读取用户 ruleset 数据，与 base 合并后注册。
 *
 * 需在以下场景调用：
 * - 游戏开始时（start handler，createFight 之前）
 * - 从 Redis 恢复 host 后（actionMessage / responseMessage，newTick 之前）
 *
 * 服务器重启后运行时注册会丢失，此函数保证恢复时重新注册。
 */
async function ensureRulesetRegistered(rulesetKey: string): Promise<void> {
    if (!isUserRulesetKey(rulesetKey)) return;
    if (isRegisteredRuleset(rulesetKey)) return;

    const rulesetId = extractUserRulesetId(rulesetKey);
    const userRuleset = await prisma.ruleset.findFirst({ where: { id: rulesetId } });
    if (!userRuleset) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: `User ruleset ${rulesetId} not found`,
        });
    }

    const override = (userRuleset.data as UserRulesetData) ?? {};
    const merged = getMergedRuleset(userRuleset.baseRuleset, override, userRuleset.name);
    registerRuleset(rulesetKey, merged);
    logger.debug('Registered user ruleset', { rulesetId, syntheticKey: rulesetKey });
}

const newTick = (host: FightHost, ctx?: LogContext) => {
    // 从持久化的 rngState 重建 RNG，保证跨多次 action 的随机序列连续。
    const rng = Rng.resume(host.rngState);
    const tick = createTick(host, {
        rng,
        adapter: {
            async initDeck(side, deckType) {
                const idxs = this.fight.decks[side][deckType].map((card, i) => i);
                return this.rng.shuffle(idxs);
            },
        },
        logger: {
            warn: (msg) => logger.warn(msg, ctx),
            error: (msg) => logger.error(msg, ctx),
            debug: (msg) => logger.debug(msg, ctx),
            info: (msg) => logger.info(msg, ctx),
        },
    });
    return tick;
};

const handlePacket = async (gameId: string, packet: FightPacket, opts: {
    sideUsers?: Record<FightSide, string>,
} = {}) => {
    let sideUsers = opts.sideUsers ?? await (async () => {
        const players = await prisma.gamePlayer.findMany({
            where: { gameId },
        });
        const playerId = players.find(p => p.side === 'player')?.userId;
        const opposingId = players.find(p => p.side === 'opposing')?.userId;
        if (!playerId || !opposingId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game is missing players' });
        return { player: playerId, opposing: opposingId };
    })();

    // TODO: prevent by chunking packets
    if (JSON.stringify(packet).length > 10_000)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Packet is too large' });

    await prisma.gamePacket.create({
        data: {
            gameId,
            packet: packet as Prisma.JsonObject,
        },
    });

    const outboundPackets = fromEntries(entries(sideUsers).map(([side, userId]): [FightSide, FightPacket] => {
        const events = clone(packet.settled).map(e => translateEvent(e, side)).filter(e => e) as Event[];
        return [side, { settled: events }];
    }));

    return outboundPackets;
};

export const gameRouter = router({
    get: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            includeInitPacket: z.boolean().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const game = await prisma.game.findFirst({ where: { id: input.gameId } });
            if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });

            const player = await prisma.gamePlayer.findFirst({
                where: { gameId: input.gameId, userId: ctx.session.user.id },
            });
            if (!player) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a player in this game' });

            const side = zFightSide.parse(player.side);

            const host = await kv.getHost(input.gameId);
            if (!host) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Game host not found' });

            const outboundFight = translateFight(host.fight, side);

            let initPacket: FightPacket | null = null;
            if (input.includeInitPacket) {
                const [firstPacket, secondPacket] = await prisma.gamePacket.findMany({
                    where: { gameId: input.gameId },
                    orderBy: { createdAt: 'asc' },
                    take: 2,
                });
                if (firstPacket && !secondPacket) initPacket = firstPacket.packet as FightPacket;
                else if (!firstPacket) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Game has not started' });
            }

            const outboundInitPacket: FightPacket | null = initPacket && translatePacket(initPacket, side);

            // Phase 4 断线重连：返回最新 packet 的 id 和 createdAt，
            // 客户端可在重连后用 getPacketsSince 拉取错过的 packet 恢复动画连续性。
            const lastPacket = await prisma.gamePacket.findFirst({
                where: { gameId: input.gameId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, createdAt: true },
            });

            return {
                id: input.gameId,
                fight: outboundFight,
                initPacket: outboundInitPacket,
                lastPacketId: lastPacket?.id ?? null,
                lastPacketAt: lastPacket?.createdAt ?? null,
                endedAt: game.endedAt,
            };
        }),

    /**
     * Phase 4 断线重连：拉取某个 packet 之后的所有 packet（不含该 packet 本身）。
     *
     * 用途：客户端重连时，本地状态可能滞后于服务端。通过记录最后看到的 packetId，
     * 客户端可以请求此端点获取错过的 packet 并按序回放，恢复动画连续性。
     *
     * 注意：如果 host 仍在 Redis 中（游戏未结束），fight 状态是权威的；
     * 如果 host 已被 flush（游戏结束或超时），客户端只能依赖 packet 回放重建状态。
     */
    getPacketsSince: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            afterPacketId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const player = await prisma.gamePlayer.findFirst({
                where: { gameId: input.gameId, userId: ctx.session.user.id },
            });
            if (!player) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a player in this game' });
            const side = zFightSide.parse(player.side);

            const afterPacket = await prisma.gamePacket.findUnique({
                where: { id: input.afterPacketId },
                select: { createdAt: true },
            });
            if (!afterPacket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Reference packet not found' });

            const packets = await prisma.gamePacket.findMany({
                where: {
                    gameId: input.gameId,
                    createdAt: { gt: afterPacket.createdAt },
                },
                orderBy: { createdAt: 'asc' },
                select: { id: true, packet: true },
            });

            const outboundPackets = packets.map(p => ({
                id: p.id,
                packet: translatePacket(p.packet as FightPacket, side),
            }));

            return { packets: outboundPackets };
        }),

    /**
     * Phase 4 观战断线重连：拉取错过的 packet（中立视角）。
     *
     * 与 `getPacketsSince` 类似但不要求调用者是游戏参与者，
     * 且用 `translatePacketForSpectator` 翻译以隐藏双方手牌信息。
     */
    getSpectatorPacketsSince: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            afterPacketId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const game = await prisma.game.findFirst({ where: { id: input.gameId } });
            if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });

            const afterPacket = await prisma.gamePacket.findUnique({
                where: { id: input.afterPacketId },
                select: { createdAt: true },
            });
            if (!afterPacket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Reference packet not found' });

            const packets = await prisma.gamePacket.findMany({
                where: {
                    gameId: input.gameId,
                    createdAt: { gt: afterPacket.createdAt },
                },
                orderBy: { createdAt: 'asc' },
                select: { id: true, packet: true },
            });

            const outboundPackets = packets.map(p => ({
                id: p.id,
                packet: translatePacketForSpectator(p.packet as FightPacket, 'player'),
            }));

            return { packets: outboundPackets };
        }),

    /**
     * Phase 4 回放系统：列出当前用户可回放的对局（已结束且用户是参与者）。
     */
    listReplayable: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(50).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 20;
            const gamePlayers = await prisma.gamePlayer.findMany({
                where: { userId: ctx.session.user.id },
                include: {
                    game: {
                        include: {
                            players: { include: { user: true } },
                        },
                    },
                },
                orderBy: { game: { createdAt: 'desc' } },
                take: limit,
            });

            return gamePlayers
                .filter(gp => gp.game.endedAt != null)
                .map(gp => {
                    const player = gp.game.players.find(p => p.side === 'player');
                    const opposing = gp.game.players.find(p => p.side === 'opposing');
                    return {
                        gameId: gp.gameId,
                        side: gp.side,
                        endedAt: gp.game.endedAt!,
                        createdAt: gp.game.createdAt,
                        playerName: player?.user.name ?? 'Unknown',
                        opposingName: opposing?.user.name ?? 'Unknown',
                        playerId: player?.userId ?? '',
                        opposingId: opposing?.userId ?? '',
                    };
                });
        }),

    /**
     * Phase 4 回放系统：获取一局对战的全部 packet 和初始 fight 重建数据。
     *
     * 返回 opts + decks（游戏开始时保存的），客户端用 createFight(opts, ['player'], decks)
     * 重建初始空 fight，然后逐个 addPacket 播放事件序列。
     *
     * 返回的 packet 都已 translateEvent 到 player 视角（与观战模式一致）。
     */
    getReplay: protectedProcedure
        .input(z.object({
            gameId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const game = await prisma.game.findFirst({
                where: { id: input.gameId },
                include: { players: { include: { user: true } } },
            });
            if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });
            if (!game.endedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game has not ended yet' });

            // 校验：只有参与过该对局的玩家可以回放（防止信息泄露）
            const isPlayer = game.players.some(p => p.userId === ctx.session.user.id);
            if (!isPlayer) throw new TRPCError({ code: 'FORBIDDEN', message: 'You were not a player in this game' });

            // 历史数据可能没有 opts/decks，无法回放
            if (!game.opts || !game.decks) {
                throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Replay data not available for this game (legacy data)' });
            }

            const packets = await prisma.gamePacket.findMany({
                where: { gameId: input.gameId },
                orderBy: { createdAt: 'asc' },
                select: { id: true, packet: true },
            });

            // 回放视角固定为 player 方（与观战模式一致）
            const side = 'player' as const;
            const outboundPackets = packets.map(p => ({
                id: p.id,
                packet: translatePacket(p.packet as FightPacket, side),
            }));

            const player = game.players.find(p => p.side === 'player');
            const opposing = game.players.find(p => p.side === 'opposing');

            return {
                gameId: input.gameId,
                seed: game.seed,
                opts: game.opts as PrismaJson.FightOptions,
                decks: game.decks as PrismaJson.GameDecks,
                packets: outboundPackets,
                playerName: player?.user.name ?? 'Unknown',
                opposingName: opposing?.user.name ?? 'Unknown',
            };
        }),

    /**
     * Phase 4 观战模式：获取当前观战视角的对战状态（中立视角）。
     *
     * 与 `get` 类似，但不要求调用者是游戏参与者，且用 `translateFightForSpectator`
     * 隐藏双方手牌信息。返回 initPacket（如果有且只有一个 packet）让观战者从开局重建状态。
     */
    spectate: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            includeInitPacket: z.boolean().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const game = await prisma.game.findFirst({ where: { id: input.gameId } });
            if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });

            const host = await kv.getHost(input.gameId);
            // 游戏可能已结束（host 被 flush），此时无法观战实时状态；
            // 引导用户使用回放系统查看历史对局。
            if (!host) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game is no longer live. Use replay instead.' });

            // 观战视角固定为 player 方，但用 translateFightForSpectator 隐藏双方手牌信息
            const side = 'player' as const;
            const outboundFight = translateFightForSpectator(host.fight, side);

            let initPacket: FightPacket | null = null;
            if (input.includeInitPacket) {
                const [firstPacket, secondPacket] = await prisma.gamePacket.findMany({
                    where: { gameId: input.gameId },
                    orderBy: { createdAt: 'asc' },
                    take: 2,
                });
                if (firstPacket && !secondPacket) initPacket = firstPacket.packet as FightPacket;
                else if (!firstPacket) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Game has not started' });
            }

            const outboundInitPacket: FightPacket | null = initPacket && translatePacketForSpectator(initPacket, side);

            const lastPacket = await prisma.gamePacket.findFirst({
                where: { gameId: input.gameId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, createdAt: true },
            });

            return {
                id: input.gameId,
                fight: outboundFight,
                initPacket: outboundInitPacket,
                lastPacketId: lastPacket?.id ?? null,
                lastPacketAt: lastPacket?.createdAt ?? null,
                endedAt: game.endedAt,
            };
        }),
    start: protectedProcedure
        .input(z.object({
            lobbyId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const lobby = await prisma.lobby.findFirst({ where: { id: input.lobbyId } });
            if (!lobby) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lobby not found' });
            if (lobby.ownerId !== ctx.session.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not the owner of this lobby' });

            const preexistingGameId = await kv.getLobbyGame(input.lobbyId);
            if (preexistingGameId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game already started' });

            const sides = zFightSides.nullable().catch(null).parse(await kv.getLobbySides(input.lobbyId));
            if (!sides || sides.opposing === sides.player)
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You must have two different players' });

            const decks = await kv.getLobbyDecks(input.lobbyId);
            const playerDeckName = decks[sides.player];
            const opposingDeckName = decks[sides.opposing];
            if (!playerDeckName || !opposingDeckName)
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Both players must have a deck selected' });

            const [playerDeck, opposingDeck] = await prisma.$transaction([
                prisma.deck.findFirst({ where: { ownerId: sides.player, name: playerDeckName } }),
                prisma.deck.findFirst({ where: { ownerId: sides.opposing, name: opposingDeckName } }),
            ]);

            if (!playerDeck || !opposingDeck)
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Both players must have a cloud-saved deck selected' });

            // TODO: verify that the decks are valid

            const concurrencyKey = `game-start:${input.lobbyId}`;
            await upConcurrency(concurrencyKey, 1, () => { throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Game is already starting',
            }); });

            try {
                const changedFightOptions = zFightOptions.partial().parse(lobby.options);
                const fightOptions = { ...defaultFightOptions(changedFightOptions.ruleset), ...changedFightOptions };

                // Phase 3.4：如果使用用户 ruleset，确保已注册到运行时 rulesets map
                if (changedFightOptions.ruleset) {
                    await ensureRulesetRegistered(changedFightOptions.ruleset);
                }

                const fight = createFight(fightOptions, ['player', 'opposing'], {
                    player: zDeckCards.parse(playerDeck.cards),
                    opposing: zDeckCards.parse(opposingDeck.cards),
                });
                const gameId = randomUUID();
                // 用 gameId 作为 RNG 种子并持久化到 Game.seed，供 Phase 4 回放复现。
                const host = createFightHost(fight, gameId);

                logger.debug('Starting lobby game', { lobbyId: input.lobbyId, gameId });

                const tick = newTick(host, { lobbyId: lobby.id, gameId });
                const initPacket = await startGame(tick);

                // TODO: handle errors past this point by rolling back changes

                await prisma.game.create({
                    data: {
                        id: gameId,
                        lobbyId: lobby.id,
                        seed: host.seed,
                        // Phase 4 回放：保存初始 opts 和 decks，供回放重建 fight
                        opts: fightOptions as Prisma.JsonObject,
                        decks: {
                            player: zDeckCards.parse(playerDeck.cards),
                            opposing: zDeckCards.parse(opposingDeck.cards),
                        } as Prisma.JsonObject,
                        players: { createMany: { data: [
                            { userId: sides.player, side: 'player' },
                            { userId: sides.opposing, side: 'opposing' },
                        ] } },
                    },
                });

                await kv.setLobbyGame(lobby.id, gameId);
                await kv.setHost(gameId, host);

                logger.debug('Lobby game started', { lobbyId: input.lobbyId, gameId });

                await kv.setGameSides(gameId, sides);

                await handlePacket(gameId, initPacket, {
                    sideUsers: { player: sides.player, opposing: sides.opposing },
                });

                triggerLobbyGameStart(lobby.id);

                await kv.setHost(gameId, host);
            } finally {
                await downConcurrency(concurrencyKey);
                await logger.flush();
            }
        }),
    actionMessage: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            data: zPlayerMessage,
        }))
        .mutation(async ({ ctx, input }) => {
            const host = await kv.getHost(input.gameId);
            if (!host) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });

            // Phase 3.4：恢复 host 后确保用户 ruleset 已注册（服务器可能重启过）
            await ensureRulesetRegistered(host.fight.opts.ruleset);

            await upConcurrency(`game-action:${input.gameId}`, 1, () => { throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Game is already processing an action',
            }); });

            // TODO: replace try / finally with 'using' statements
            try {
                const sides = await kv.getGameSides(input.gameId);
                if (!sides) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Game is missing players' });
                const userSide = entries(sides).find(([, userId]) => userId === ctx.session.user.id)?.[0];
                if (!userSide) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a player in this game' });

                logger.debug(`Handling game message: ${JSON.stringify(input.data)}`, { gameId: input.gameId });

                const tick = newTick(host, { gameId: input.gameId });
                const serverPacket = input.data.type === 'action'
                    ? await handleAction(tick, userSide, input.data.action) : input.data.type === 'response'
                        ? await handleResponse(tick, userSide, input.data.res) : null;

                if (!serverPacket) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Invalid message' });

                const outboundPackets = await handlePacket(input.gameId, serverPacket);

                await kv.setHost(input.gameId, host);

                for (const [side, packet] of entries(outboundPackets)) {
                    triggerFightPacket(sides[side], input.gameId, packet);
                }

                // Phase 4 观战模式：中立视角 packet 推送。
                // 用 translatePacketForSpectator 从原始 serverPacket 翻译，
                // 隐藏双方手牌信息（draw/newSigil/play/mustPlay/chooseDraw 等）。
                // 不能复用 outboundPackets.player（已 translateEvent 过，二次翻译会出错）。
                const spectatorPacket = translatePacketForSpectator(serverPacket, 'player');
                if (spectatorPacket) triggerSpectatorPacket(input.gameId, spectatorPacket);

                const aliveSides = FIGHT_SIDES.filter(side => (
                    host.fight.players[side].deaths < host.fight.opts.lives
                ));
                const winningSide = aliveSides.length === 1 ? aliveSides[0] : null;

                if (winningSide) {
                    await kv.flushGame(input.gameId);
                    const game = await prisma.game.update({ where: { id: input.gameId }, data: { endedAt: new Date() } });

                    if (game.lobbyId) await kv.setLobbyGame(game.lobbyId, null);

                    const winningPlayer = await prisma.gamePlayer.findFirst({
                        where: { gameId: input.gameId, userId: sides[winningSide] },
                        include: { user: true },
                    });

                    if (winningPlayer)
                        logger.debug(`User '${winningPlayer.user.name}' won game`, { gameId: input.gameId, userId: winningPlayer.userId });
                    else
                        logger.error(`Game ended without a winner: ${JSON.stringify({
                            fightPlayers: host.fight.players,
                            fightOpts: host.fight.opts,
                            aliveSides,
                        })}`, { gameId: input.gameId });

                    const endMessage = winningPlayer ? `${winningPlayer.user.name} won!` : 'The game ended in a draw due to an internal error!';
                    for (const side of FIGHT_SIDES)
                        triggerGameEnd(sides[side], input.gameId, endMessage);
                    // Phase 4：通知观战者游戏结束
                    triggerSpectatorGameEnd(input.gameId, endMessage);
                }
            } finally {
                await downConcurrency(`game-action:${input.gameId}`);
                await logger.flush();
            }
        }),
    forfeit: protectedProcedure
        .input(z.object({
            lobbyId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const gameId = await kv.getLobbyGame(input.lobbyId);
            const [lobby, game] = gameId ? await prisma.$transaction([
                prisma.lobby.findFirst({ where: { id: input.lobbyId } }),
                prisma.game.findFirst({ where: { id: gameId }, include: { players: true } }),
            ]) : [null, null];
            if (!lobby) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lobby not found' });
            if (!game || !gameId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'There is no game' });

            if (!game.players.some(player => player.userId === ctx.session.user.id))
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a player in this game' });

            logger.debug(`Player '${ctx.session.user.name}' is forfeiting lobby game`, { lobbyId: input.lobbyId, userId: ctx.session.user.id, gameId });

            try {
                await kv.setLobbyGame(input.lobbyId, null);
                await kv.flushGame(gameId);
                await prisma.game.update({ where: { id: gameId }, data: { endedAt: new Date() } });

                for (const player of game.players)
                    triggerGameEnd(player.userId, gameId, `${ctx.session.user.name} has forfeited the game`);
                triggerLobbyRefetch(input.lobbyId, ctx.session.user.id);
            } finally {
                await logger.flush();
            }
        }),
});

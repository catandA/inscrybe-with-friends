import { z } from 'zod';
import { downConcurrency, protectedProcedure, router, upConcurrency } from '.';
import { TRPCError } from '@trpc/server';
import { prisma } from '../db';
import { defaultFightOptions, zDeckCards, zFightOptions, zFightSide, zFightSides, zPlayerMessage } from '@/lib/online/z';
import { kv } from '../kv';
import { FightHost, createFightHost, createTick } from '@/lib/engine/Host';
import { FIGHT_SIDES, FightSide, createFight, translateFight } from '@/lib/engine/Fight';
import { FightPacket, handleAction, handleResponse, startGame, translatePacket } from '@/lib/engine/Tick';
import { Event, translateEvent } from '@/lib/engine/Events';
import { Rng } from '@/lib/engine/Rng';
import { clone, entries, fromEntries } from '@/lib/utils';
import { Prisma } from '@prisma/client';
import { triggerFightPacket, triggerGameEnd, triggerLobbyGameStart, triggerLobbyRefetch } from '../pusher';
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

            // TODO: account for spectators

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

            return {
                id: input.gameId,
                fight: outboundFight,
                initPacket: outboundInitPacket,
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

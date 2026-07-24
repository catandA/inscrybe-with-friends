import { protectedProcedure, router } from '@/server/trpc';
import { z } from 'zod';
import { pusherServer } from '../pusher';
import { entries } from '@/lib/utils';
import { TRPCError } from '@trpc/server';
import { prisma } from '../db';

const privateChannels = entries({
    lobby: 'lobby@{id}',
    // Phase 4 观战频道：private-spectate@{gameId}
    spectate: 'spectate@{id}',
}).map(([name, pattern]) => ({
    name,
    pattern: new RegExp(`^private-${pattern
        .replace('{id}', '([a-z0-9-]+)')}$`),
}));

export const pusherRouter = router({
    // Provide access to private channels
    authorize: protectedProcedure
        .input(z.object({
            socketId: z.string(),
            channelName: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const channel = privateChannels.find(c => input.channelName.match(c.pattern));
            if (!channel) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unkown private channel' });
            const match = input.channelName.match(channel.pattern)!;

            // Auth checks
            switch (channel.name) {
                case 'lobby': {
                    const [, lobbyId] = match;
                    const lobby = await prisma.lobby.findFirst({ where: {
                        id: lobbyId,
                        // TODO: !invite_only || playership.some
                        // playerships: { some: { userId: ctx.session.user.id } },
                    } });
                    if (!lobby) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lobby not found' });
                    break;
                }
                case 'spectate': {
                    // Phase 4 观战频道授权：游戏必须存在。
                    // 不强制要求观战者是 lobby 成员——任何已登录用户都可观战，
                    // 这与 Godot 版本 LAN 广播的开放性一致。
                    // 如需限制为 lobby 成员，可加 playership 校验。
                    const [, gameId] = match;
                    const game = await prisma.game.findFirst({ where: { id: gameId } });
                    if (!game) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game not found' });
                    break;
                }
            }

            return pusherServer.authorizeChannel(input.socketId, input.channelName);
        }),

    // Get user data
    authenticate: protectedProcedure
        .input(z.object({
            socketId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const authUser = pusherServer.authenticateUser(input.socketId, {
                id: ctx.session.user.id,
                name: ctx.session.user.name,
                image: ctx.session.user.image,
            });
            return authUser;
        }),
});

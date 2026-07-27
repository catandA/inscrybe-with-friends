import { protectedProcedure, router } from '@/server/trpc';
import { prisma } from '../db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChatMessagePayload } from '../socket';
import { triggerGameChat, triggerLobbyChat } from '../socket';

/**
 * 把 Prisma ChatMessage 转成广播给客户端的 ChatMessagePayload。
 * 包含发送者的 name/image，让客户端无需再查用户表。
 */
function toPayload(message: {
    id: string;
    content: string;
    createdAt: Date;
    userId: string;
    user: { name: string; image: string };
}): ChatMessagePayload {
    return {
        id: message.id,
        userId: message.userId,
        name: message.user.name,
        image: message.user.image,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
    };
}

export const chatRouter = router({
    /**
     * 拉取大厅最近聊天记录（最多 50 条，按时间正序）。
     * 用户进入 lobby 页面时调用，让聊天框有上下文。
     */
    historyForLobby: protectedProcedure
        .input(z.object({
            lobbyId: z.string(),
        }))
        .query(async ({ input }) => {
            const messages = await prisma.chatMessage.findMany({
                where: { lobbyId: input.lobbyId },
                orderBy: { createdAt: 'desc' },
                take: 50,
                include: { user: { select: { name: true, image: true } } },
            });
            // desc 取出后翻转成正序，让客户端直接渲染
            return messages.reverse().map(toPayload);
        }),

    /**
     * 拉取对局最近聊天记录。玩家和观战者都可见。
     */
    historyForGame: protectedProcedure
        .input(z.object({
            gameId: z.string(),
        }))
        .query(async ({ input }) => {
            const messages = await prisma.chatMessage.findMany({
                where: { gameId: input.gameId },
                orderBy: { createdAt: 'desc' },
                take: 50,
                include: { user: { select: { name: true, image: true } } },
            });
            return messages.reverse().map(toPayload);
        }),

    /**
     * 发送大厅消息。校验发送者是 lobby 成员，写入 DB 后广播给 lobby 房间。
     */
    sendToLobby: protectedProcedure
        .input(z.object({
            lobbyId: z.string(),
            content: z.string().min(1).max(500),
        }))
        .mutation(async ({ ctx, input }) => {
            const playership = await prisma.playership.findUnique({
                where: {
                    lobbyId_userId: {
                        lobbyId: input.lobbyId,
                        userId: ctx.session.user.id,
                    },
                },
            });
            if (!playership) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a player in this lobby' });

            const message = await prisma.chatMessage.create({
                data: {
                    userId: ctx.session.user.id,
                    lobbyId: input.lobbyId,
                    content: input.content,
                },
                include: { user: { select: { name: true, image: true } } },
            });

            triggerLobbyChat(input.lobbyId, toPayload(message));
            return { ok: true };
        }),

    /**
     * 发送对局消息。校验：发送者必须是对局玩家 OR lobby 成员（观战者通常是 lobby 成员）。
     * 写入 DB 后广播到 game 房间（玩家 + 观战者都订阅）。
     *
     * 不强制要求是 GamePlayer——观战者也可能想发言。简化为：只要 lobby 成员即可，
     * 因为非 lobby 成员的观战者本来也无法进入 lobby 页面（lobbies.get 会 FORBIDDEN）。
     * 如果将来允许任意链接观战，需要补充 GamePlayer OR playership 的 OR 校验。
     */
    sendToGame: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            lobbyId: z.string(),
            content: z.string().min(1).max(500),
        }))
        .mutation(async ({ ctx, input }) => {
            // 校验 lobby 成员身份
            const playership = await prisma.playership.findUnique({
                where: {
                    lobbyId_userId: {
                        lobbyId: input.lobbyId,
                        userId: ctx.session.user.id,
                    },
                },
            });
            if (!playership) throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a player in this lobby' });

            const message = await prisma.chatMessage.create({
                data: {
                    userId: ctx.session.user.id,
                    gameId: input.gameId,
                    content: input.content,
                },
                include: { user: { select: { name: true, image: true } } },
            });

            triggerGameChat(input.gameId, toPayload(message));
            return { ok: true };
        }),
});

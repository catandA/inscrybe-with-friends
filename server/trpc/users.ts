import { protectedProcedure, router } from '@/server/trpc';
import { prisma } from '../db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { zUserTheme } from '@/lib/online/z';

export const userRouter = router({
    getSession: protectedProcedure
        .query(async ({ ctx }) => {
            return ctx.session;
        }),
    getUser: protectedProcedure
        .query(async ({ ctx }) => {
            const user = await prisma.user.findFirst({
                where: { id: ctx.session.user.id },
            });
            if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
            return user;
        }),
    /**
     * Phase 3.3 主题系统：保存用户主题（CSS 变量键值对）。
     * 传 null 清除主题（恢复默认）。
     */
    setTheme: protectedProcedure
        .input(z.object({
            theme: zUserTheme.nullable(),
        }))
        .mutation(async ({ ctx, input }) => {
            await prisma.user.update({
                where: { id: ctx.session.user.id },
                data: { theme: input.theme as never },
            });
            return { ok: true };
        }),
});

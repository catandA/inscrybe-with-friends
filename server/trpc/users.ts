import { protectedProcedure, publicProcedure, router } from '@/server/trpc';
import { prisma } from '../db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { zUserTheme } from '@/lib/online/z';
import bcrypt from 'bcryptjs';

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
     * Phase 6 邮箱密码注册。
     *
     * 与 OAuth provider 不同，Credentials provider 自己不做用户创建——
     * 用户必须先调本 mutation 创建账号（含 bcrypt 哈希的 passwordHash），
     * 然后才能用 Credentials provider 登录。
     *
     * 注册成功后客户端应跳转到登录页让用户用 `signIn('credentials', { email, password })` 登录。
     * 不自动登录是为了避免 Credentials provider 与本 mutation 的责任重叠（也方便测试）。
     */
    register: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(8).max(128),
            name: z.string().min(1).max(64),
        }))
        .mutation(async ({ input }) => {
            const existing = await prisma.user.findFirst({ where: { email: input.email } });
            if (existing) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
            }
            const passwordHash = await bcrypt.hash(input.password, 10);
            // 邮箱密码用户没头像 URL，用一个简单占位（避免 image 字段非空约束报错）。
            // 用户登录后可在 profile 页面自定义头像（待后续 phase 实现）。
            const placeholderImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(input.name)}&background=random`;
            await prisma.user.create({
                data: {
                    email: input.email,
                    passwordHash,
                    name: input.name,
                    image: placeholderImage,
                },
            });
            return { ok: true };
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

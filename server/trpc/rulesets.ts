import { protectedProcedure, router } from '@/server/trpc';
import { prisma } from '../db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { zBaseRuleset, zUserRulesetData } from '@/lib/online/z';
import { getMergedRuleset, rulesets } from '@/lib/defs/prints';

const MAX_USER_RULESETS = 20;

export const rulesetsRouter = router({
    /**
     * 列出当前用户的所有 rulesets（DB 元数据，不含合并后的完整数据）。
     */
    list: protectedProcedure
        .query(async ({ ctx }) => {
            return await prisma.ruleset.findMany({
                where: { ownerId: ctx.session.user.id },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    baseRuleset: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }),

    /**
     * 获取单个 ruleset 的完整数据（DB 元数据 + override 数据）。
     * 不返回合并后的 Ruleset——客户端可基于 baseRuleset + data 自行合并，
     * 或在需要时调用 merge 端点。这样保持 API 简洁，避免传输大量 base 数据。
     */
    get: protectedProcedure
        .input(z.object({
            id: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const ruleset = await prisma.ruleset.findFirst({
                where: { id: input.id, ownerId: ctx.session.user.id },
            });
            if (!ruleset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ruleset not found' });
            return ruleset;
        }),

    /**
     * 创建新 ruleset（fork 自 base）。
     * 初始 data 为空对象（即完全继承 base）；用户后续通过 update 修改。
     */
    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1).max(64),
            baseRuleset: zBaseRuleset,
        }))
        .mutation(async ({ ctx, input }) => {
            const count = await prisma.ruleset.count({ where: { ownerId: ctx.session.user.id } });
            if (count >= MAX_USER_RULESETS) {
                throw new TRPCError({ code: 'FORBIDDEN', message: `You can only have up to ${MAX_USER_RULESETS} rulesets` });
            }

            try {
                return await prisma.ruleset.create({
                    data: {
                        ownerId: ctx.session.user.id,
                        name: input.name,
                        baseRuleset: input.baseRuleset,
                        data: {} as Prisma.JsonObject,
                    },
                });
            } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                    throw new TRPCError({ code: 'CONFLICT', message: 'Ruleset name already exists' });
                }
                throw err;
            }
        }),

    /**
     * 更新 ruleset 的 name 和/或 data。
     * data 会通过 zUserRulesetData 校验（sigil 引用合法性）。
     * 合并后的引用合法性（printId 引用）在 getMergedRuleset 中校验，失败时返回 400。
     */
    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            name: z.string().min(1).max(64).optional(),
            data: zUserRulesetData.optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const existing = await prisma.ruleset.findFirst({
                where: { id: input.id, ownerId: ctx.session.user.id },
            });
            if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ruleset not found' });

            // 若提供了 data，校验合并后引用合法性（printId 引用）
            if (input.data) {
                try {
                    getMergedRuleset(existing.baseRuleset, input.data, input.name ?? existing.name);
                } catch (err) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: err instanceof Error ? err.message : 'Invalid ruleset data',
                    });
                }
            }

            try {
                return await prisma.ruleset.update({
                    where: { id: input.id },
                    data: {
                        ...(input.name !== undefined && { name: input.name }),
                        ...(input.data !== undefined && { data: input.data as Prisma.JsonObject }),
                    },
                });
            } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                    throw new TRPCError({ code: 'CONFLICT', message: 'Ruleset name already exists' });
                }
                throw err;
            }
        }),

    /**
     * 删除 ruleset。
     * 注意：不检查是否有 deck/lobby 引用此 ruleset——删除后引用方会 fallback 到 base ruleset 或报错。
     * （简化实现；后续可加引用计数。）
     */
    delete: protectedProcedure
        .input(z.object({
            id: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            await prisma.ruleset.delete({
                where: { id: input.id, ownerId: ctx.session.user.id },
            }).catch(err => {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Ruleset not found' });
                }
                throw err;
            });
        }),

    /**
     * 复制 ruleset（自己的或内置的）。
     * - 内置 ruleset：sourceId 传 'imfComp' 等内置 id，创建一个 data 为空的 fork。
     * - 用户 ruleset：sourceId 传 UUID，复制其 data。
     */
    duplicate: protectedProcedure
        .input(z.object({
            sourceId: z.string(),
            newName: z.string().min(1).max(64),
        }))
        .mutation(async ({ ctx, input }) => {
            const count = await prisma.ruleset.count({ where: { ownerId: ctx.session.user.id } });
            if (count >= MAX_USER_RULESETS) {
                throw new TRPCError({ code: 'FORBIDDEN', message: `You can only have up to ${MAX_USER_RULESETS} rulesets` });
            }

            let baseRuleset: string;
            let data: Prisma.JsonObject;

            if (input.sourceId in rulesets) {
                // 内置 ruleset fork
                baseRuleset = input.sourceId;
                data = {};
            } else {
                // 用户 ruleset 复制
                const source = await prisma.ruleset.findFirst({
                    where: { id: input.sourceId, ownerId: ctx.session.user.id },
                });
                if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source ruleset not found' });
                baseRuleset = source.baseRuleset;
                data = source.data as Prisma.JsonObject;
            }

            try {
                return await prisma.ruleset.create({
                    data: {
                        ownerId: ctx.session.user.id,
                        name: input.newName,
                        baseRuleset,
                        data,
                    },
                });
            } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                    throw new TRPCError({ code: 'CONFLICT', message: 'Ruleset name already exists' });
                }
                throw err;
            }
        }),
});

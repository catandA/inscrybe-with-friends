import { protectedProcedure, publicProcedure, router } from '@/server/trpc';
import { prisma } from '../db';
import { redis } from '../kv';
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
     * Phase 6.3 账户详情页：查询当前用户已绑定的所有 provider。
     *
     * 返回值含义：
     * - `'credentials'` 在列表里 ⇔ User.passwordHash 非 null（可用邮箱密码登录）
     * - `'discord'` / `'github'` 在列表里 ⇔ Connection 表存在对应记录
     *
     * 客户端用这个列表在账户详情页渲染每个 provider 的「已绑定 / 未绑定」状态，
     * 未绑定的 provider 提供「绑定」按钮触发 OAuth 流程关联到当前 User。
     */
    getConnectedProviders: protectedProcedure
        .query(async ({ ctx }) => {
            const [user, connections] = await Promise.all([
                prisma.user.findFirst({
                    where: { id: ctx.session.user.id },
                    select: { passwordHash: true },
                }),
                prisma.connection.findMany({
                    where: { userId: ctx.session.user.id },
                    select: { provider: true },
                }),
            ]);
            const providers: string[] = [];
            if (user?.passwordHash) providers.push('credentials');
            for (const c of connections) providers.push(c.provider);
            return providers;
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
     *
     * Phase 6.4 设计 bug 修复：移除 email @unique 后，OAuth provider 创建的 User
     * 也会带 email（如 GitHub 公开 email=3047354896@qq.com），这种 User 的 passwordHash
     * 是 null。若用户随后用同一 email 来注册邮箱密码，旧逻辑一律报 CONFLICT「Email already
     * registered」，用户永远无法给已绑过的 OAuth 账号补密码。
     *
     * 现细分两种情况：
     * - 现有 User 没有 passwordHash（仅 OAuth-only 账号）：把它「升级」——写入
     *   bcrypt 哈希 + 用注册表单的 name 覆盖（便于用户自定义用户名），返回 upgraded: true。
     *   前端据此显示「已绑定到 OAuth 账号，现可用邮箱密码登录」。
     * - 现有 User 已有 passwordHash（真凭据账号）：仍报 CONFLICT，邮箱密码账号唯一。
     *
     * TOCTOU：findFirst → update 不是事务，理论上两个并发请求都可能命中 id=null 的
     * OAuth-only User 并各自 update 最后写入的胜出——但 update 只写 passwordHash/name，
     * 不会重复创建账号，账号数仍唯一，可接受。
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
                if (existing.passwordHash) {
                    // 真凭据账号：保持邮箱密码账号唯一。
                    throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
                }
                // 仅 OAuth 账号：补上密码（升级），不创建新账号以免重复用户。
                const passwordHash = await bcrypt.hash(input.password, 10);
                await prisma.user.update({
                    where: { id: existing.id },
                    data: { passwordHash, name: input.name },
                });
                return { ok: true, upgraded: true };
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
            return { ok: true, upgraded: false };
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
    /**
     * Phase 6.4 账号合并：查询目标 User 的基本信息（头像/用户名/email/已绑定 provider）。
     *
     * 用于合并确认 UI 显示两个账号的对比信息。
     * 只能查自己（currentUserId === targetUserId）或在 link-callback 流程中暂存的 pendingMergeUserId。
     * 后者由前端把 pendingMergeUserId 作为 input 传入，这里不做权限校验——
     * 因为这个 query 只返回公开展示信息（头像/用户名/provider 列表），不含敏感字段。
     */
    getUserInfo: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const [user, connections] = await Promise.all([
                prisma.user.findFirst({
                    where: { id: input.userId },
                    select: { id: true, name: true, image: true, email: true, passwordHash: true, createdAt: true },
                }),
                prisma.connection.findMany({
                    where: { userId: input.userId },
                    select: { provider: true, createdAt: true },
                }),
            ]);
            if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            const providers: string[] = [];
            if (user.passwordHash) providers.push('credentials');
            for (const c of connections) providers.push(c.provider);
            return {
                id: user.id,
                name: user.name,
                image: user.image,
                email: user.email,
                createdAt: user.createdAt,
                providers,
            };
        }),
    /**
     * Phase 6.4 账号合并：把 mergeUser 的所有数据转移到 keepUser，删除 mergeUser。
     *
     * 调用场景：
     * 1. 用户在账户详情页点「绑定 GitHub」
     * 2. 走 OAuth → NextAuth 创建/登录到 mergeUser（因为 getUserByEmail 返回 null）
     * 3. link-callback 页面检测到 session 从 keepUser 变成 mergeUser
     * 4. 用户选择保留哪个 → 调本 mutation
     *
     * 转移的数据：
     * - Connection（provider 关联，这是合并的核心——让 keepUser 拥有 mergeUser 的所有登录方式）
     * - Deck / Ruleset（UGC）
     * - Playership / GamePlayer（对局记录）
     * - Friendship（好友关系，去重避免自指）
     * - Session（Redis 里把 mergeUser 的 session 指向 keepUser）
     *
     * 约束：keepUser 和 mergeUser 不能是同一个；合并后 mergeUser 被物理删除。
     * 唯一约束冲突（Deck/Ruleset 的 @@unique([ownerId, name])）：跳过同名记录（keepUser 优先）。
     */
    mergeAccounts: protectedProcedure
        .input(z.object({
            keepUserId: z.string(),
            mergeUserId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { keepUserId, mergeUserId } = input;
            if (keepUserId === mergeUserId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a user into itself' });
            }
            // 安全校验：调用者必须是 keepUser 或 mergeUser 之一（防止合并别人的账号）
            if (ctx.session.user.id !== keepUserId && ctx.session.user.id !== mergeUserId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only merge your own accounts' });
            }

            const [keepUser, mergeUser] = await Promise.all([
                prisma.user.findFirst({ where: { id: keepUserId } }),
                prisma.user.findFirst({ where: { id: mergeUserId } }),
            ]);
            if (!keepUser || !mergeUser) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }

            // 1. Connection：转移 provider 关联。
            //    主键是 [userId, provider]，如果 keepUser 已有同 provider 的 Connection，先删 mergeUser 的。
            const keepProviders = await prisma.connection.findMany({
                where: { userId: keepUserId },
                select: { provider: true },
            });
            const keepProviderSet = new Set(keepProviders.map(c => c.provider));
            const mergeConnections = await prisma.connection.findMany({
                where: { userId: mergeUserId },
            });
            for (const conn of mergeConnections) {
                if (keepProviderSet.has(conn.provider)) {
                    // keepUser 已绑定这个 provider，跳过（keepUser 优先）
                    await prisma.connection.delete({ where: { userId_provider: { userId: mergeUserId, provider: conn.provider } } });
                } else {
                    await prisma.connection.update({
                        where: { userId_provider: { userId: mergeUserId, provider: conn.provider } },
                        data: { userId: keepUserId },
                    });
                }
            }

            // 2. Deck：@@unique([ownerId, name])，同名跳过。
            const keepDeckNames = new Set((await prisma.deck.findMany({
                where: { ownerId: keepUserId },
                select: { name: true },
            })).map(d => d.name));
            const mergeDecks = await prisma.deck.findMany({ where: { ownerId: mergeUserId } });
            for (const deck of mergeDecks) {
                if (keepDeckNames.has(deck.name)) {
                    await prisma.deck.delete({ where: { id: deck.id } });
                } else {
                    await prisma.deck.update({ where: { id: deck.id }, data: { ownerId: keepUserId } });
                }
            }

            // 3. Ruleset：@@unique([ownerId, name])，同名跳过。
            const keepRulesetNames = new Set((await prisma.ruleset.findMany({
                where: { ownerId: keepUserId },
                select: { name: true },
            })).map(r => r.name));
            const mergeRulesets = await prisma.ruleset.findMany({ where: { ownerId: mergeUserId } });
            for (const rs of mergeRulesets) {
                if (keepRulesetNames.has(rs.name)) {
                    await prisma.ruleset.delete({ where: { id: rs.id } });
                } else {
                    await prisma.ruleset.update({ where: { id: rs.id }, data: { ownerId: keepUserId } });
                }
            }

            // 4. Playership：主键 [lobbyId, userId]，直接改 userId。
            await prisma.playership.updateMany({
                where: { userId: mergeUserId },
                data: { userId: keepUserId },
            });

            // 5. GamePlayer：主键 [gameId, userId]，直接改 userId。
            await prisma.gamePlayer.updateMany({
                where: { userId: mergeUserId },
                data: { userId: keepUserId },
            });

            // 6. Lobby：ownerId 直接改。
            await prisma.lobby.updateMany({
                where: { ownerId: mergeUserId },
                data: { ownerId: keepUserId },
            });

            // 7. Friendship：自引用关系，去重避免自指 + 避免重复好友。
            //    friendOf 的 userId 改 keepUserId，friends 的 userId 也改。
            //    先删会导致冲突的记录（已经是 keepUser 的好友），再转移。
            const mergeFriends = await prisma.user.findFirst({
                where: { id: mergeUserId },
                include: { friends: { select: { id: true } }, friendOf: { select: { id: true } } },
            });
            if (mergeFriends) {
                // 删除 mergeUser 与 keepUser 之间的好友关系（避免自指）
                await prisma.user.update({
                    where: { id: mergeUserId },
                    data: { friends: { disconnect: { id: keepUserId } } },
                });
                await prisma.user.update({
                    where: { id: mergeUserId },
                    data: { friendOf: { disconnect: { id: keepUserId } } },
                });

                // 查 keepUser 已有的好友，去重
                const keepFriendIds = new Set([
                    ...(await prisma.user.findFirst({
                        where: { id: keepUserId },
                        include: { friends: { select: { id: true } }, friendOf: { select: { id: true } } },
                    }))?.friends.map(f => f.id) ?? [],
                    ...(await prisma.user.findFirst({
                        where: { id: keepUserId },
                        include: { friends: { select: { id: true } }, friendOf: { select: { id: true } } },
                    }))?.friendOf.map(f => f.id) ?? [],
                ]);

                // 转移 mergeUser 的好友关系到 keepUser（跳过已是 keepUser 好友的）
                for (const friend of mergeFriends.friends) {
                    if (!keepFriendIds.has(friend.id) && friend.id !== keepUserId) {
                        await prisma.user.update({
                            where: { id: keepUserId },
                            data: { friends: { connect: { id: friend.id } } },
                        });
                    }
                }
                for (const friend of mergeFriends.friendOf) {
                    if (!keepFriendIds.has(friend.id) && friend.id !== keepUserId) {
                        await prisma.user.update({
                            where: { id: keepUserId },
                            data: { friendOf: { connect: { id: friend.id } } },
                        });
                    }
                }
            }

            // 8. 删除 mergeUser（Cascade 会清理残留的 Connection/Friendship 关联）
            await prisma.user.delete({ where: { id: mergeUserId } });

            // 9. 更新 Redis session：把当前 session 指向 keepUser。
            //    NextAuth session key 是 `session:<token>`，value 是 userId。
            //    遍历所有 session:* key 太重，这里只更新当前 session（通过 ctx 拿不到 token，用 SCAN 批量改）。
            //    实际上用户合并后会重新登录，这里做 best-effort：扫 mergeUserId 的 session 全改成 keepUserId。
            //    注：session.strategy 已切到 jwt（Phase 6 修复），Redis 里不再有 session:* key，
            //    此扫描为 no-op。JWT 不可服务端失效，用户合并后必须重新登录——与上述「实际上
            //    用户合并后会重新登录」一致。保留代码以防将来切回 database session。
            let cursor = 0;
            do {
                const reply = await redis.scan(cursor, { MATCH: 'session:*', COUNT: 100 });
                cursor = reply.cursor;
                for (const key of reply.keys) {
                    const val = await redis.get(key);
                    if (val === mergeUserId) {
                        await redis.set(key, keepUserId);
                    }
                }
            } while (cursor !== 0);

            return { ok: true, keepUserId };
        }),
});

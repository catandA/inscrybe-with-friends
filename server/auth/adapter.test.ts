import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 6.4 账号合并：adapter 接口契约测试。
 *
 * Phase 6.4 起不再用 email 做隐式合并（getUserByEmail 总是返回 null）。
 * 三种登录方式（Discord/GitHub/邮箱密码）平等对待，账号合并是用户主动操作：
 * 用户在账户详情页点「绑定 X」→ 走 OAuth → link-callback 检测 session 变化 → 合并确认 UI。
 *
 * 本测试 mock prisma + redis，验证 adapter 的这几个方法满足上述契约。
 * 注意：这是接口契约测试，不验证 NextAuth 框架内部调度顺序（那是框架的职责）。
 */

// === Mock prisma + redis（用 vi.hoisted 让变量与 vi.mock 一起提升，避免 TDZ） ===
const { mockPrisma, mockRedis } = vi.hoisted(() => ({
    mockPrisma: {
        user: {
            create: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        connection: {
            findFirst: vi.fn(),
            upsert: vi.fn(),
        },
    },
    mockRedis: {
        set: vi.fn(),
        get: vi.fn(),
        pTTL: vi.fn(),
        del: vi.fn(),
    },
}));
vi.mock('@/server/db', () => ({
    prisma: mockPrisma,
    // withRetry 直接执行传入的 fn，让测试关注 prisma 调用契约本身
    withRetry: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));
vi.mock('@/server/kv', () => ({
    redis: mockRedis,
}));

// import 在 mock 之后生效
import { adapter } from './adapter';

const BASE_USER = {
    id: 'user-1',
    name: 'alice',
    image: 'https://example.com/a.png',
    email: 'alice@example.com',
    emailVerified: new Date('2026-01-01'),
    passwordHash: 'hashed',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Phase 6 多 provider 账号合并：adapter 接口契约', () => {
    describe('getUserByEmail', () => {
        it('Phase 6.4：总是返回 null（不再用 email 做隐式合并）', async () => {
            // Phase 6.4 起，getUserByEmail 总是返回 null。
            // NextAuth 会走 createUser 创建新 User，用户在 link-callback 页面主动合并。
            const result = await adapter.getUserByEmail!('alice@example.com');

            expect(result).toBeNull();
            expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
        });

        it('空 email 返回 null', async () => {
            const result = await adapter.getUserByEmail!('');

            expect(result).toBeNull();
            expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
        });
    });

    describe('linkAccount', () => {
        it('把 OAuth account 关联到已存在 User（核心合并步骤）', async () => {
            const account = {
                userId: 'user-1',
                provider: 'github',
                providerAccountId: 'gh-12345',
                access_token: 'tok-abc',
                refresh_token: 'ref-xyz',
                expires_at: 1800000000,
                scope: 'read:user user:email',
            };
            mockPrisma.connection.upsert.mockResolvedValueOnce({});

            await adapter.linkAccount!(account as any);

            // 验证 upsert 用正确的复合主键和 token 写入
            expect(mockPrisma.connection.upsert).toHaveBeenCalledWith({
                where: { userId_provider: { userId: 'user-1', provider: 'github' } },
                update: {
                    connectionId: 'gh-12345',
                    token: {
                        refresh_token: 'ref-xyz',
                        access_token: 'tok-abc',
                        expires_at: 1800000000,
                        scope: 'read:user user:email',
                    },
                },
                create: {
                    userId: 'user-1',
                    provider: 'github',
                    connectionId: 'gh-12345',
                    token: {
                        refresh_token: 'ref-xyz',
                        access_token: 'tok-abc',
                        expires_at: 1800000000,
                        scope: 'read:user user:email',
                    },
                },
            });
        });

        it('同一 provider 重复关联时 upsert 更新而非报错', async () => {
            const account = {
                userId: 'user-1',
                provider: 'discord',
                providerAccountId: 'dis-999',
                access_token: 'tok-new',
                refresh_token: 'ref-new',
                expires_at: 1800000001,
                scope: 'email identify',
            };
            mockPrisma.connection.upsert.mockResolvedValueOnce({});

            await adapter.linkAccount!(account as any);

            expect(mockPrisma.connection.upsert).toHaveBeenCalledTimes(1);
            const args = mockPrisma.connection.upsert.mock.calls[0][0];
            expect(args.where.userId_provider).toEqual({ userId: 'user-1', provider: 'discord' });
            expect(args.update.connectionId).toBe('dis-999');
        });
    });

    describe('getUserByAccount', () => {
        it('通过 Connection 反查到 User（已绑定 provider 的用户登录）', async () => {
            mockPrisma.connection.findFirst.mockResolvedValueOnce({
                userId: 'user-1',
                provider: 'github',
                connectionId: 'gh-12345',
            });
            mockPrisma.user.findFirst.mockResolvedValueOnce(BASE_USER);

            const result = await adapter.getUserByAccount!({
                provider: 'github',
                providerAccountId: 'gh-12345',
            });

            expect(result?.id).toBe('user-1');
            expect(mockPrisma.connection.findFirst).toHaveBeenCalledWith({
                where: { connectionId: 'gh-12345', provider: 'github' },
            });
            expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
                where: { id: 'user-1' },
            });
        });

        it('provider 未绑定时返回 null', async () => {
            mockPrisma.connection.findFirst.mockResolvedValueOnce(null);

            const result = await adapter.getUserByAccount!({
                provider: 'github',
                providerAccountId: 'gh-not-bound',
            });

            expect(result).toBeNull();
        });
    });

    describe('createUser', () => {
        it('新 OAuth 用户：email 不存在时创建新 User', async () => {
            mockPrisma.user.create.mockResolvedValueOnce({ id: 'user-new' });

            const result = await adapter.createUser!({
                name: 'carol',
                image: 'https://example.com/c.png',
                email: 'carol@example.com',
                emailVerified: new Date('2026-07-25'),
            } as any);

            expect(result.id).toBe('user-new');
            expect(result.email).toBe('carol@example.com');
            expect(mockPrisma.user.create).toHaveBeenCalledWith({
                data: {
                    name: 'carol',
                    image: 'https://example.com/c.png',
                    email: 'carol@example.com',
                    emailVerified: new Date('2026-07-25'),
                },
            });
        });

        it('OAuth provider 没返回 email 时存 null（兼容旧 Discord 用户）', async () => {
            mockPrisma.user.create.mockResolvedValueOnce({ id: 'user-no-email' });

            const result = await adapter.createUser!({
                name: 'dave',
                image: 'https://example.com/d.png',
                email: undefined,
                emailVerified: undefined,
            } as any);

            expect(result.email).toBe('');
            const data = mockPrisma.user.create.mock.calls[0][0].data;
            expect(data.email).toBeNull();
            expect(data.emailVerified).toBeNull();
        });
    });
});

/**
 * 端到端流程推演（Phase 6.4，不实跑，靠契约组合验证）：
 *
 * 1. 用户用 Discord 登录（没 email）：
 *    - NextAuth 调 adapter.getUserByAccount → null（没绑过）
 *    - NextAuth 调 adapter.getUserByEmail → null（Phase 6.4 总是返回 null）
 *    - NextAuth 调 adapter.createUser → 创建 User A（email=null）
 *    - NextAuth 调 adapter.linkAccount → 关联 discord 到 A
 *
 * 2. 同一用户用 GitHub 登录（email=g@x.com）：
 *    - 同上流程创建 User B（email=g@x.com）
 *    - 现在有 A 和 B 两个账号
 *
 * 3. 用户在 A 的账户详情页点「绑定 GitHub」：
 *    - sessionStorage 存 A 的 userId
 *    - signIn('github', { callbackUrl: '/auth/link-callback' })
 *    - NextAuth 走 OAuth：getUserByAccount(github) → 返回 B（github 已绑 B）
 *    - session 切换到 B
 *
 * 4. link-callback 页面检测到 session 从 A 变成 B：
 *    - 显示合并确认 UI，用户选择保留哪个
 *    - 调 user.mergeAccounts(keepUserId, mergeUserId)
 *    - mutation 转移 Connection/Deck/Ruleset/Playership/GamePlayer/Friendship
 *    - 删除被合并的 User
 *    - 更新 Redis session 指向 keepUser
 *
 * 5. 之后用 GitHub 或 Discord 登录都走 getUserByAccount → 返回 keepUser ✅
 */

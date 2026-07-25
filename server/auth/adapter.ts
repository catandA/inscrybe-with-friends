import { Adapter, AdapterUser } from 'next-auth/adapters';
import { redis } from '@/server/kv';
import { prisma, withRetry } from '@/server/db';
import { User } from '@prisma/client';

const toAdapterUser = (user: Pick<User, 'id' | 'name' | 'image' | 'email' | 'emailVerified'>): AdapterUser => ({
    id: user.id,
    name: user.name,
    image: user.image,
    email: user.email ?? '',
    emailVerified: user.emailVerified,
});

export const adapter: Adapter = {
    async createUser(userInfo) {
        // 旧版只存 name + image；新增 email/emailVerified 以支持邮箱密码登录与 GitHub OAuth。
        // OAuth provider 没返回的字段会是 undefined（Prisma 视为 skip），保持 null。
        const user = {
            name: userInfo.name!,
            image: userInfo.image!,
            email: userInfo.email ?? null,
            emailVerified: userInfo.emailVerified ?? null,
        };
        const { id } = await withRetry(() => prisma.user.create({ data: user }));

        return toAdapterUser({ id, ...user });
    },
    async getUser(id) {
        const user = await withRetry(() => prisma.user.findFirst({ where: { id } }));

        return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
        // Phase 6.4：不再用 email 做隐式账号合并。
        //
        // 旧版（Phase 6.1-6.3）查 email 返回已存在 User，让 NextAuth 自动把新 provider
        // 关联到该 User。问题：Discord 用户可能没 email，不同 provider 的 email 可能不同，
        // 隐式合并不透明且不可控。
        //
        // 现在三种登录方式平等对待（email 不是唯一键），总是返回 null。
        // NextAuth 会：getUserByAccount → null → createUser 创建新 User。
        // 用户主动在账户详情页点「绑定 X」时，走 link-callback 流程检测冲突并合并。
        return null;
    },
    async getUserByAccount({ providerAccountId, provider }) {
        const connection = await withRetry(() => prisma.connection.findFirst({
            where: { connectionId: providerAccountId, provider },
        }));

        if (!connection) return null;

        const user = await withRetry(() => prisma.user.findFirst({ where: { id: connection.userId } }));
        if (!user) return null;

        return toAdapterUser(user);
    },
    async updateUser({ id, ...user }) {
        if (id == null) throw new Error('Missing user ID');

        const newUser = await withRetry(() => prisma.user.update({
            where: { id },
            data: {
                name: user.name ?? undefined,
                image: user.image ?? undefined,
                email: user.email ?? undefined,
                emailVerified: user.emailVerified ?? undefined,
            },
        }));

        return toAdapterUser(newUser);
    },
    async deleteUser(userId) {
        // TODO
        return;
    },
    async linkAccount(account) {
        const pks = {
            userId: account.userId,
            provider: account.provider,
        };
        const token: PrismaJson.ConnectionToken = {
            refresh_token: account.refresh_token!,
            access_token: account.access_token!,
            expires_at: account.expires_at!,
            scope: account.scope!,
        };
        const meta = {
            connectionId: account.providerAccountId,
            token,
        };
        await withRetry(() => prisma.connection.upsert({
            where: { userId_provider: pks },
            update: meta,
            create: { ...pks, ...meta },
        }));
    },
    async unlinkAccount({ providerAccountId, provider }) {
        // TODO
        return;
    },
    async createSession({ sessionToken, userId, expires }) {
        await redis.set(`session:${sessionToken}`, userId, { PXAT: expires.getTime() });
        return { sessionToken, userId, expires };
    },
    async getSessionAndUser(sessionToken) {
        const userId = await redis.get(`session:${sessionToken}`);
        if (!userId) return null;

        const expiresIn = await redis.pTTL(`session:${sessionToken}`);
        if (expiresIn === -2) return null;

        const session = { sessionToken, userId, expires: new Date(Date.now() + expiresIn) };

        const user = await withRetry(() => prisma.user.findFirst({ where: { id: userId } }));

        return user ? { session, user: toAdapterUser(user) } : null;
    },
    async updateSession({ sessionToken, ...session }) {
        const setOptions = session.expires ? { PXAT: session.expires.getTime() } : {};
        const oldId = await redis.get(`session:${sessionToken}`);

        if (!oldId && !session.userId) return;
        const userId = (session.userId ?? oldId) as string;

        await redis.set(`session:${sessionToken}`, userId, setOptions);

        let expiresIn = await redis.pTTL(`session:${sessionToken}`);
        return { sessionToken, userId, expires: new Date(Date.now() + expiresIn) };
    },
    async deleteSession(sessionToken) {
        await redis.del(`session:${sessionToken}`);
        return;
    },
};

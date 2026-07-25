import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma, withRetry } from '@/server/db';
import type { User } from '@prisma/client';

const toAdapterUser = (user: User) => ({
    id: user.id,
    name: user.name,
    image: user.image,
    email: user.email ?? '',
    emailVerified: user.emailVerified,
});

/**
 * 邮箱密码登录（Credentials provider）。
 *
 * NextAuth 的 Credentials provider 不依赖 adapter 做用户查找/创建——它自己负责凭据校验，
 * 校验通过后返回 user 对象，NextAuth 据此创建 session（走 adapter.createSession）。
 *
 * 与 OAuth provider 的差异：
 * - 不创建 Connection（无 OAuth token 需要保存）
 * - 用户必须先用 `user.register` mutation 注册，本 provider 只校验
 * - 不实现「email 匹配则链接账号」——OAuth 用户首次登录邮箱密码会失败（passwordHash 为 null）
 */
export const credentialsProvider = CredentialsProvider({
    id: 'credentials',
    name: 'Email',
    credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string') return null;

        const user = await withRetry(() => prisma.user.findFirst({ where: { email } }));
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return toAdapterUser(user);
    },
});

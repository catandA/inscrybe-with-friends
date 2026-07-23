import { NextAuthConfig } from 'next-auth';
import { adapter } from './adapter';
import { provider } from './provider';

export const authConfig: NextAuthConfig = {
    // 本地开发必须：非 Vercel 环境下 NextAuth v5 默认不信任 Host 头，会导致 Configuration 错误
    trustHost: true,
    // v5 用 AUTH_SECRET，显式传入避免 beta 版自动检测不可靠
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    providers: [
        provider({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
        }),
    ],
    adapter,
    callbacks: {
        signIn: async ({ account, profile }) => {
            if (account?.provider === 'discord' && !profile?.verified) {
                return '/auth/error?error=not_verified';
            }
            return true;
        },
        session({ session, user }: any) {
            if (session.user) {
                session.user.id = user.id;
            }
            return session;
        },
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/internal-error',
        signOut: '/auth/signout',
    },
};

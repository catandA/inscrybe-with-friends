import { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { adapter } from './adapter';
import { provider as discordProvider } from './provider';
import { credentialsProvider } from './credentials';

export const authConfig: NextAuthConfig = {
    // 本地开发必须：非 Vercel 环境下 NextAuth v5 默认不信任 Host 头，会导致 Configuration 错误
    trustHost: true,
    // v5 用 AUTH_SECRET，显式传入避免 beta 版自动检测不可靠
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    providers: [
        discordProvider({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
        }),
        GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            // 默认 scope 是空（只读用户基础信息）；加 user:email 拿邮箱用于账号链接
            authorization: { params: { scope: 'read:user user:email' } },
        }),
        credentialsProvider,
    ],
    adapter,
    callbacks: {
        signIn: async ({ account, profile }) => {
            // Discord：profile.verified 是 Discord 的邮箱验证状态，未验证拒绝登录
            if (account?.provider === 'discord' && !(profile as { verified?: boolean })?.verified) {
                return '/auth/error?error=not_verified';
            }
            // GitHub / Credentials：不做额外检查（GitHub 邮箱验证状态由 provider 内部处理）
            return true;
        },
        session({ session, user }: any) {
            if (session.user) {
                session.user.id = user.id;
                // 暴露 email 到 session，方便客户端显示
                if (user.email) session.user.email = user.email;
            }
            return session;
        },
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/internal-error',
        // signOut 不配置自定义页面：signOut() 直接 POST /api/auth/signout 即可，
        // 无需前端 page。若以后要自定义退出页可再加。
    },
};

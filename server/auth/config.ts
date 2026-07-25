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
    // Phase 6 修复：Credentials provider 不兼容 database session。
    //
    // NextAuth v5 设了 adapter 后默认 session.strategy = "database"（Redis session）。
    // 但 Credentials provider 的 authorize() 返回 user 后，database session 流程不能
    // 正确建立/读回 session——表现为 POST /api/auth/callback/credentials 返回 200 但
    // GET /api/auth/session 返回 null、tRPC 401、页面无限重定向回 /auth/signin。
    //
    // 官方文档明确：Credentials provider 只能用 JWT session。切到 jwt 后：
    // - session 存在签名后的 JWT cookie 里，不再走 adapter.createSession/getSessionAndUser
    // - adapter 仍用于 createUser/getUserByAccount/linkAccount（OAuth 账号管理不受影响）
    // - mergeAccounts 的 Redis session 扫描（step 9）变为 no-op（JWT 不可服务端失效，
    //   用户合并后需重新登录，与原有注释一致）
    session: { strategy: 'jwt' },
    callbacks: {
        signIn: async ({ account, profile }) => {
            // Discord：profile.verified 是 Discord 的邮箱验证状态，未验证拒绝登录
            if (account?.provider === 'discord' && !(profile as { verified?: boolean })?.verified) {
                return '/auth/error?error=not_verified';
            }
            // GitHub / Credentials：不做额外检查（GitHub 邮箱验证状态由 provider 内部处理）
            return true;
        },
        // JWT 策略下 session callback 收到 token（不是 database 策略的 user）。
        // token.sub = user.id（authorize 返回的 id 或 adapter 的 user.id）
        // token.email / token.name / token.picture 由 NextAuth 默认 jwt callback 填充。
        session({ session, token }: any) {
            if (session.user) {
                session.user.id = token.sub;
                // 暴露 email 到 session，方便客户端显示
                if (token.email) session.user.email = token.email;
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

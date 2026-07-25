import '@/styles/globals.css';
import { syncLanguageAfterMount } from '@/lib/i18n';
import Filters from '@/components/Filters';
import styles from './app.module.css';
import { SessionProvider, signIn } from 'next-auth/react';
import { AppType } from 'next/app';
import { useEffect } from 'react';
import { Text } from '@/components/ui/Text';
import { Rulebook } from '@/components/Rulebook';
import * as Tone from 'tone';
import { trpc } from '@/lib/trpc';
import { isClient } from '@/lib/utils';
import { Navbar } from '@/components/nav/Navbar';
import { InfoButton } from '@/components/nav/InfoButton';
import { socketClient } from '@/lib/socket';
import { applyTheme, type Theme } from '@/lib/themes';

const App: AppType<{ session: any }> = ({ Component, pageProps, ...appProps }) => {
    const version = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';
    const isPlayPath = /^\/play(?:\/|$)/.test(appProps.router.pathname);

    // hydration 完成后再应用真实语言偏好，避免与 SSR 首次渲染（固定为 en）不一致
    useEffect(() => {
        syncLanguageAfterMount();
    }, []);

    // Phase 3.3 主题系统：加载用户保存的主题（hooks 必须在顶层调用，不能放在条件块内）
    const { data: user } = trpc.user.getUser.useQuery(void 0, {
        refetchOnWindowFocus: false,
        enabled: isPlayPath,
    });
    useEffect(() => {
        if (!isPlayPath) return;
        const theme = user?.theme as Theme | null | undefined;
        applyTheme(theme ?? null);
    }, [user?.theme, isPlayPath]);

    // Phase 6.4 修复：getSession 必须在顶层调用（不能放在 if 块内）。
    // 旧版把 useQuery 放在 `if (isPlayPath)` 里，导致 /play 与非 /play 路径间导航时
    // hook 数量变化，触发 "Rendered fewer/more hooks than expected" 错误。
    // 用 enabled 控制是否发请求，hook 本身始终调用。
    const { data: session, isLoading } = trpc.user.getSession.useQuery(void 0, {
        refetchOnWindowFocus: false,
        enabled: isPlayPath,
    });

    if (appProps.router.pathname.startsWith('/auth/')) {
        return <SessionProvider>
            <Component {...pageProps} />
        </SessionProvider>;
    }

    if (isPlayPath) {
        // Phase 6.6 修复：客户端导航（如邮箱登录后 router.push('/play')）无 SSR 预取，
        // useQuery 首次渲染 data=undefined（loading 中）。旧代码 !session 把 loading
        // 当成「未登录」直接 signIn() 跳回登录页，导致邮箱登录后无限重定向。
        // OAuth 不受影响因为整页跳转有 SSR 预取，data 首次渲染就有值。
        // 修：等 loading 结束再判断。loading 中渲染空白页等一帧。
        if (!session && isLoading) {
            return <div></div>;
        }
        if (!session) {
            if (isClient) signIn();
            return <div></div>;
        }

        if (isClient) {
            // Socket.IO 客户端：登录后手动连接（autoConnect: false）。
            // 鉴权走同源 cookie，不需要像 Pusher 那样单独 signin。
            // @ts-ignore
            window.socketClient = socketClient;
            if (!socketClient.connected) socketClient.connect();
        };

        return <div className={styles.play} onClick={() => Tone.start()}>
            <SessionProvider>
                <div className={styles.main}>
                    <Component {...pageProps} />
                </div>
                <Navbar className={styles.nav} />
                <Rulebook />
            </SessionProvider>
            <Filters />
            <InfoButton />
            <div className={styles.version}>
                <Text>Alpha ({ version })</Text>
            </div>
        </div>;
    }

    return <div className={styles.app} onClick={() => Tone.start()}>
        <SessionProvider>
            <Component {...pageProps} />
        </SessionProvider>
    </div>;
};

export default trpc.withTRPC(App);

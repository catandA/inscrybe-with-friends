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

    if (appProps.router.pathname.startsWith('/auth/')) {
        return <SessionProvider>
            <Component {...pageProps} />
        </SessionProvider>;
    }

    if (isPlayPath) {
        const { data: session } = trpc.user.getSession.useQuery(void 0, {
            refetchOnWindowFocus: false,
        });

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

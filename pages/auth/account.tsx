import styles from './account.module.css';
import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { DiscordIcon, GithubIcon, EmailIcon, type ProviderId } from '@/components/ui/Icons';

/**
 * 账户详情页。
 *
 * 取代 SignInButton 直接 signOut 的行为：已登录用户点击 Navbar 头像按钮跳到这里，
 * 可以查看当前账号信息、查看/绑定其他 provider、退出登录。
 *
 * 「绑定其他 provider」走标准 OAuth 流程：signIn(provider, { callbackUrl: '/auth/account' })。
 * NextAuth 默认行为：如果 OAuth provider 返回的 email 与当前 User email 一致，
 * getUserByEmail 返回当前 User → linkAccount 关联到当前 User（合并完成）。
 * 如果 email 不一致会创建新 User（不是合并），所以下方有提示文案要求保持 email 一致。
 */
export default function Account() {
    const { t } = useTranslation();
    const router = useRouter();
    const session = useSession();
    const [pendingProvider, setPendingProvider] = useState<string | null>(null);
    const providers = trpc.user.getConnectedProviders.useQuery(void 0, {
        refetchOnWindowFocus: false,
        // 未登录时不发请求
        enabled: session.status === 'authenticated',
    });

    // 未登录被路由到这里（不应该发生，SignInButton 已登录才跳）—— 引导回登录页
    // 必须放 useEffect，render 阶段 SSR/client 必须返回一致节点避免 hydration mismatch
    useEffect(() => {
        if (session.status === 'unauthenticated') {
            router.replace('/auth/signin');
        }
    }, [session.status, router]);

    if (session.status !== 'authenticated') {
        // loading / unauthenticated 都返回 loading 占位
        return <div className={styles.page}><Text size={12}>{t('common.loading')}</Text></div>;
    }

    const user = session.data!.user!;
    const connected = providers.data ?? [];

    const onLink = (provider: 'discord' | 'github') => {
        if (pendingProvider) return;
        setPendingProvider(provider);
        // Phase 6.4：存当前 userId 到 sessionStorage，link-callback 页面读它检测 session 变化。
        // 因为 getUserByEmail 返回 null（不再隐式合并），OAuth 会创建/登录到新 User，
        // link-callback 检测到 session userId 变了 → 进入合并流程。
        // Phase 6.5：同时存 pendingProvider，OAuthAccountNotLinked 时 internal-error 用它重新走 OAuth。
        sessionStorage.setItem('pendingKeepUserId', user.id!);
        sessionStorage.setItem('pendingProvider', provider);
        signIn(provider, { callbackUrl: '/auth/link-callback' });
    };

    const onSignOut = () => {
        signOut({ callbackUrl: '/auth/signin' });
    };

    const providerRows: Array<{
        id: ProviderId;
        name: string;
        icon: typeof DiscordIcon;
        canLink: boolean;
    }> = [
        { id: 'discord', name: 'Discord', icon: DiscordIcon, canLink: true },
        { id: 'github', name: 'GitHub', icon: GithubIcon, canLink: true },
        { id: 'credentials', name: t('auth.email'), icon: EmailIcon, canLink: false },
    ];

    return <div className={styles.page}>
        <Text size={16}>{t('auth.accountTitle')}</Text>

        <div className={styles.profile}>
            <Image
                className={styles.avatar}
                src={user.image!}
                width={48}
                height={48}
                alt={t('auth.userAvatarAlt')}
            />
            <div className={styles.profileInfo}>
                <Text size={12}>{user.name}</Text>
                {user.email && <Text size={10}>{user.email}</Text>}
            </div>
        </div>

        <div className={styles.providers}>
            {providerRows.map(({ id, name, icon: Icon, canLink }) => {
                const isBound = connected.includes(id);
                return <div key={id} className={styles.providerRow}>
                    <div className={styles.providerLeft}>
                        <Icon className={styles.providerIcon} />
                        <span className={styles.providerName}>{name}</span>
                    </div>
                    {isBound
                        ? <span className={`${styles.providerStatus} ${styles.bound}`}>✓</span>
                        : canLink
                            ? <Button
                                disabled={pendingProvider !== null}
                                onClick={() => onLink(id as 'discord' | 'github')}
                            >
                                <Text>{pendingProvider === id ? t('common.loading') : t('auth.link')}</Text>
                            </Button>
                            : <span className={`${styles.providerStatus} ${styles.unbound}`}>—</span>}
                </div>;
            })}
        </div>

        <p className={styles.tip}>{t('auth.linkTip')}</p>

        <div className={styles.actions}>
            <Button className={styles.signOutBtn} onClick={onSignOut} border="--ruby-dark">
                <Text>{t('auth.signOut')}</Text>
            </Button>
        </div>

        <Link className={styles.backLink} href="/play">
            <Text size={8}>{t('common.back')}</Text>
        </Link>
    </div>;
}

import styles from './signin.module.css';
import { useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';
import { DiscordIcon, GithubIcon, EmailIcon } from '@/components/ui/Icons';

/**
 * 多 provider 登录页。
 *
 * - OAuth provider 走 signIn(providerId, { callbackUrl }) 由 NextAuth 处理跳转。
 *   国内访问 GitHub OAuth 服务器可能超时——signIn 跳转前的 fetch 加 timeout 兜底。
 * - Credentials provider 走 signIn('credentials', { email, password, redirect: false })，
 *   Promise.race 加 15s timeout，超时报错给用户而不是无限 loading。
 *
 * Phase 6.5：处理 OAuthAccountNotLinked。
 * NextAuth v5 在 OAuth callback 抛 OAuthAccountNotLinked 后会重定向到 pages.signIn
 * 而不是 pages.error（v5 行为，文档没明说但实测如此）。所以本页检测 query.error
 * 和 sessionStorage 的 pendingKeepUserId + pendingProvider：
 * - 检测到冲突 → 显示「退出并继续合并」UI
 *   1. signOut({ redirect: false }) 退出当前账号 A
 *   2. signIn(pendingProvider, { callbackUrl: '/auth/link-callback' })
 *   3. 这次未登录，NextAuth 正常登录到 user C
 *   4. link-callback 检测到 pendingKeepUserId=A，session.userId=C → 显示合并 UI
 * - 无 pending 数据 → 显示原始 query.error 给用户
 */
const OAUTH_TIMEOUT_MS = 15000;
const CREDENTIALS_TIMEOUT_MS = 15000;

/** Promise.race 包装：超时抛 Error，避免 signIn 卡死。 */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
    ]);
}

type Phase = 'signin' | 'conflict' | 'switching';

export default function SignIn() {
    const { t } = useTranslation();
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>('signin');
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const callbackUrl = (router.query.callbackUrl as string) || '/auth/success';
    const queryError = typeof router.query.error === 'string' ? router.query.error : null;

    // Phase 6.5：检测 OAuthAccountNotLinked + pending merge 流程
    useEffect(() => {
        if (!router.isReady) return;
        if (queryError !== 'OAuthAccountNotLinked') return;
        const pendingKeepUserId = sessionStorage.getItem('pendingKeepUserId');
        const pendingProvider = sessionStorage.getItem('pendingProvider');
        if (pendingKeepUserId && pendingProvider) {
            setPhase('conflict');
        }
    }, [router.isReady, queryError]);

    const onContinueMerge = async () => {
        const pendingProvider = sessionStorage.getItem('pendingProvider');
        if (!pendingProvider) {
            setPhase('signin');
            return;
        }
        setPhase('switching');
        // 退出当前账号（不跳转），再用 pendingProvider 重新走 OAuth 登录到另一个账号。
        // sessionStorage 的 pendingKeepUserId 保留，link-callback 用它检测合并。
        await signOut({ redirect: false });
        await signIn(pendingProvider, { callbackUrl: '/auth/link-callback' });
    };

    const onOAuth = async (provider: 'discord' | 'github') => {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            // signIn 返回的 Promise 在 OAuth 跳转模式下不会 resolve（页面会跳走），
            // 但跳转前的 fetch（拿 authorization URL）可能卡住。超时给用户反馈。
            await withTimeout(
                signIn(provider, { callbackUrl }),
                OAUTH_TIMEOUT_MS,
                t('auth.oauthTimeout'),
            );
        } catch (e) {
            setPending(false);
            setError((e as Error).message);
        }
    };

    const onEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pending) return;
        setError(null);
        setPending(true);
        try {
            const result = await withTimeout(
                signIn('credentials', {
                    email,
                    password,
                    redirect: false,
                }),
                CREDENTIALS_TIMEOUT_MS,
                t('auth.oauthTimeout'),
            );
            setPending(false);
            if (result?.error) {
                setError(t('auth.invalidCredentials'));
                return;
            }
            // 登录成功：通过 callbackUrl 通知父窗口并关闭，或直接跳转
            if (window.opener) {
                window.opener.postMessage({ type: 'signinResult', success: true }, window.location.origin);
                window.close();
                return;
            }
            router.push(callbackUrl);
        } catch (e) {
            setPending(false);
            setError((e as Error).message);
        }
    };

    // Phase 6.5：合并冲突视图（或正在切换）
    if (phase === 'conflict' || phase === 'switching') {
        return <div className={styles.page}>
            <Text size={14}>{t('auth.accountConflictTitle')}</Text>
            <p style={{ maxWidth: '320px' }}><Text size={10}>{t('auth.accountConflictBody')}</Text></p>
            <div className={styles.providers}>
                <Button
                    disabled={phase === 'switching'}
                    onClick={onContinueMerge}
                    border="--emerald-dark"
                >
                    <Text>{phase === 'switching' ? t('common.loading') : t('auth.signOutAndContinue')}</Text>
                </Button>
            </div>
            <Link href="/auth/account">
                <Text size={8}>{t('common.cancel')}</Text>
            </Link>
        </div>;
    }

    return <div className={styles.page}>
        <Text size={16}>{t('auth.signIn')}</Text>
        {queryError && queryError !== 'OAuthAccountNotLinked' && (
            <Text size={10} className={styles.error}>{queryError}</Text>
        )}
        <div className={styles.providers}>
            <Button
                border="--discord-dark"
                onClick={() => onOAuth('discord')}
                disabled={pending}
            >
                <DiscordIcon className={styles.providerIcon} />
                <Text>{t('auth.signInWithDiscord')}</Text>
            </Button>
            <Button
                border="--github-dark"
                onClick={() => onOAuth('github')}
                disabled={pending}
            >
                <GithubIcon className={styles.providerIcon} />
                <Text>{t('auth.signInWithGithub')}</Text>
            </Button>
            <Button
                border="--emerald-dark"
                onClick={() => setShowEmailForm(v => !v)}
                disabled={pending}
            >
                <EmailIcon className={styles.providerIcon} />
                <Text>{showEmailForm ? t('auth.back') : t('auth.signInWithEmail')}</Text>
            </Button>
        </div>
        {showEmailForm && <form className={styles.form} onSubmit={onEmailSubmit}>
            <label className={styles.label}>
                <Text size={10}>{t('auth.email')}</Text>
                <input
                    type="email"
                    className={styles.input}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                />
            </label>
            <label className={styles.label}>
                <Text size={10}>{t('auth.password')}</Text>
                <input
                    type="password"
                    className={styles.input}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                />
            </label>
            {error && <Text size={10} className={styles.error}>{error}</Text>}
            <Button disabled={pending}>
                <Text>{pending ? t('common.loading') : t('auth.signIn')}</Text>
            </Button>
            <Link className={styles.registerLink} href="/auth/register">
                <Text size={10}>{t('auth.noAccountRegister')}</Text>
            </Link>
        </form>}
    </div>;
}

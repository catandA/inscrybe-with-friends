import styles from './signin.module.css';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';

/**
 * 多 provider 登录页。
 *
 * Phase 6 之前：直接 signIn('discord') 自动跳转。
 * Phase 6 起：Discord / GitHub / Email 三种 provider 并列，邮箱密码登录用展开式表单。
 *
 * OAuth provider 走 signIn(providerId, { callbackUrl }) 由 NextAuth 处理跳转。
 * Credentials provider 走 signIn('credentials', { email, password, redirect: false }) 拿到结果后本地处理。
 */
export default function SignIn() {
    const { t } = useTranslation();
    const router = useRouter();
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const callbackUrl = (router.query.callbackUrl as string) || '/auth/success';

    const onOAuth = (provider: 'discord' | 'github') => {
        setPending(true);
        signIn(provider, { callbackUrl });
    };

    const onEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pending) return;
        setError(null);
        setPending(true);
        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        });
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
    };

    return <div className={styles.page}>
        <Text size={16}>{t('auth.signIn')}</Text>
        <div className={styles.providers}>
            <Button
                border="--discord-dark"
                onClick={() => onOAuth('discord')}
                disabled={pending}
            >
                <Text>{t('auth.signInWithDiscord')}</Text>
            </Button>
            <Button
                onClick={() => onOAuth('github')}
                disabled={pending}
            >
                <Text>{t('auth.signInWithGithub')}</Text>
            </Button>
            <Button
                onClick={() => setShowEmailForm(v => !v)}
                disabled={pending}
            >
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

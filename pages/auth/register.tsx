import styles from './signin.module.css';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';

/**
 * 邮箱密码注册页。
 *
 * 提交后调用 `user.register` tRPC mutation 创建用户（含 bcrypt 哈希的 passwordHash）。
 * 注册成功后跳转回 /auth/signin 让用户用刚注册的邮箱密码登录——不自动登录
 * 是为了避免 Credentials provider 与本 mutation 的责任重叠。
 */
export default function Register() {
    const { t } = useTranslation();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);

    const register = trpc.user.register.useMutation({
        onSuccess: (data) => {
            // Phase 6.4 fix：若返回 upgraded=true，说明原本是 OAuth 账号（同名 GitHub/Discord 用
            // 同一 email 登录过），现在给它补了密码——用户现可用邮箱密码登录。
            // 跳登录页前在 URL 里带一个 hint 让登录页显示「已绑定到 OAuth 账号」的提示。
            router.push({
                pathname: '/auth/signin',
                query: data?.upgraded ? { upgraded: '1' } : {},
            });
        },
        onError: (err) => {
            setError(err.message || t('auth.registerFailed'));
        },
    });

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (register.isPending) return;
        setError(null);
        if (password !== confirm) {
            setError(t('auth.passwordMismatch'));
            return;
        }
        register.mutate({ email, password, name });
    };

    return <div className={styles.page}>
        <Text size={16}>{t('auth.register')}</Text>
        <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.label}>
                <Text size={10}>{t('auth.name')}</Text>
                <input
                    className={styles.input}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    maxLength={64}
                    autoComplete="nickname"
                />
            </label>
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
                    minLength={8}
                    autoComplete="new-password"
                />
            </label>
            <label className={styles.label}>
                <Text size={10}>{t('auth.confirmPassword')}</Text>
                <input
                    type="password"
                    className={styles.input}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                />
            </label>
            {error && <Text size={10} className={styles.error}>{error}</Text>}
            <Button disabled={register.isPending}>
                <Text>{register.isPending ? t('common.loading') : t('auth.register')}</Text>
            </Button>
            <Link className={styles.registerLink} href="/auth/signin">
                <Text size={10}>{t('auth.hasAccountSignIn')}</Text>
            </Link>
        </form>
    </div>;
}

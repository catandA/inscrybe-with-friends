import styles from './SignIn.module.css';
import { AuthErrors } from '@/lib/constants';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import classNames from 'classnames';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Text } from '../ui/Text';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';

type ResultMessage = ({
    type: 'signinResult'
    error?: string;
    internalError?: string;
    success?: boolean;
}) | { type: null } | null;

/**
 * Navbar 右上角的登录/账户入口。
 *
 * - 未登录：点击弹窗打开 /auth/signin（多 provider 选择页）
 * - 已登录：点击跳 /auth/account（账户详情页），在那里可以退出/绑定其他 provider
 *
 * Phase 6.3 之前已登录直接 signOut，意图不明确（容易误点）。
 * 现在跳账户详情页，给用户明确的退出/绑定操作入口。
 */
export function SignInButton() {
    const { t } = useTranslation();
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const session = useSession();
    const isSignedIn = session.status === 'authenticated';

    useEffect(() => {
        if (isSignedIn && pending) setPending(false);
    }, [isSignedIn, pending]);

    useEffect(() => {
        const listener = ({ data }: { data: ResultMessage }) => {
            if (data?.type !== 'signinResult') return;
            console.debug('Sign in result: %o', data);
            setPending(false);

            if (data.success) {
                // 弹窗登录成功后刷新当前页，让 SessionProvider 重新拉取 session
                //（useSession 默认不轮询，不刷新的话按钮状态不会变）
                window.location.reload();
                return;
            }

            // TODO - show errors to user
            if (data.error) return console.error(`${AuthErrors[data.error]}`);
            if (data.internalError) return console.error(t('auth.internalError', { detail: data.internalError }));
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [t]);

    const onSignIn = () => {
        if (pending) return;
        window.open('/auth/signin', t('auth.signIn'), 'width=500,height=800');
        setPending(true);
    };
    const onOpenAccount = () => {
        if (pending) return;
        router.push('/auth/account');
    };

    return <Button
        className={classNames(styles.button, {
            [styles.pending]: pending,
        })}
        border="--discord-dark"
        onClick={isSignedIn ? onOpenAccount : onSignIn}
    >
        {isSignedIn
            ? <>
                <Image className={styles.avatar} src={session.data.user!.image!} width={16} height={16} alt={t('auth.userAvatarAlt')}/>
                <Text className={styles.username}>{session.data!.user!.name}</Text>
            </>
            : <Text>{` ${t('auth.signIn')} `}</Text>}
    </Button>;
}

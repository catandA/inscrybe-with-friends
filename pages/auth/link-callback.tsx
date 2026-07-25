import styles from './link-callback.module.css';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { DiscordIcon, GithubIcon, EmailIcon } from '@/components/ui/Icons';

/**
 * 绑定 provider 后的回调页。
 *
 * 流程：
 * 1. 用户在 /auth/account 点「绑定 GitHub」
 * 2. account.tsx 把当前 userId 存到 sessionStorage['pendingKeepUserId']
 * 3. signIn('github', { callbackUrl: '/auth/link-callback' })
 * 4. NextAuth 走 OAuth：getUserByAccount → null（没绑过）→ getUserByEmail → null（Phase 6.4 改的）
 *    → createUser 创建新 User B → linkAccount(github → B) → 创建 session 指向 B
 *    或者：getUserByAccount 返回已存在 User C（github 已绑过 C）→ 创建 session 指向 C
 * 5. 跳转到本页，session 现在指向 B 或 C
 * 6. 本页读 sessionStorage['pendingKeepUserId']（原账号 A 的 userId）
 *    - 如果当前 session.userId === A：说明 GitHub 已绑定到 A，无需操作，回账户页
 *    - 如果不同：说明发生了冲突，显示合并确认 UI
 *      - 查 A 和当前 session.userId 的信息
 *      - 让用户选择保留哪个
 *      - 调 mergeAccounts mutation
 *      - 成功后回账户页
 */
export default function LinkCallback() {
    const { t } = useTranslation();
    const router = useRouter();
    const session = useSession();
    const [keepUserId, setKeepUserId] = useState<string | null>(null);
    const [phase, setPhase] = useState<'loading' | 'no-action' | 'merge' | 'merging' | 'done'>('loading');
    const [mergeError, setMergeError] = useState<string | null>(null);

    // mergeAccounts mutation
    const mergeMutation = trpc.user.mergeAccounts.useMutation({
        onSuccess: () => {
            setPhase('done');
            // 清理 sessionStorage
            sessionStorage.removeItem('pendingKeepUserId');
            sessionStorage.removeItem('pendingProvider');
            // 刷新页面让 session 更新（mergeAccounts 已把 session 指向 keepUser）
            setTimeout(() => router.replace('/auth/account'), 1500);
        },
        onError: (e) => {
            setMergeError(e.message);
            setPhase('merge');
        },
    });

    // 查两个用户信息（只在 merge 阶段查）
    const keepUserQuery = trpc.user.getUserInfo.useQuery(
        { userId: keepUserId! },
        { enabled: !!keepUserId && phase === 'merge' },
    );
    const mergeUserQuery = trpc.user.getUserInfo.useQuery(
        { userId: session.data?.user?.id ?? '' },
        { enabled: session.status === 'authenticated' && phase === 'merge' },
    );

    useEffect(() => {
        if (session.status !== 'authenticated') return;
        const stored = sessionStorage.getItem('pendingKeepUserId');
        if (!stored) {
            // 没有 pendingKeepUserId，不是绑定流程，直接回账户页
            setPhase('no-action');
            setTimeout(() => router.replace('/auth/account'), 1500);
            return;
        }
        setKeepUserId(stored);
        if (session.data!.user!.id === stored) {
            // session 还是原账号——GitHub 已绑定到原账号，无需合并
            sessionStorage.removeItem('pendingKeepUserId');
            sessionStorage.removeItem('pendingProvider');
            setPhase('no-action');
            setTimeout(() => router.replace('/auth/account'), 1500);
        } else {
            // session 变成了另一个账号——需要合并
            setPhase('merge');
        }
    }, [session.status, session.data, router]);

    const onMerge = (keep: string, merge: string) => {
        setPhase('merging');
        mergeMutation.mutate({ keepUserId: keep, mergeUserId: merge });
    };

    if (phase === 'loading' || session.status === 'loading') {
        return <div className={styles.page}><Text size={10} className={styles.loading}>{t('common.loading')}</Text></div>;
    }

    if (phase === 'no-action') {
        return <div className={styles.page}><Text size={10}>{t('auth.linkSuccess')}</Text></div>;
    }

    if (phase === 'done') {
        return <div className={styles.page}><Text size={10}>{t('auth.mergeSuccess')}</Text></div>;
    }

    if (phase === 'merge' && keepUserQuery.data && mergeUserQuery.data) {
        const keep = keepUserQuery.data;
        const merge = mergeUserQuery.data;

        const renderProviders = (providers: string[]) => (
            <div className={styles.providers}>
                {providers.map(p => {
                    const Icon = p === 'discord' ? DiscordIcon : p === 'github' ? GithubIcon : EmailIcon;
                    return <span key={p} className={styles.providerTag}>
                        <Icon className={styles.providerIcon} />
                    </span>;
                })}
            </div>
        );

        return <div className={styles.page}>
            <Text size={14}>{t('auth.mergeTitle')}</Text>
            <p className={styles.tip}>{t('auth.mergeTip')}</p>

            <div className={styles.compare}>
                <div className={styles.userCard}>
                    <Image className={styles.avatar} src={keep.image} width={48} height={48} alt="" />
                    <div className={styles.userInfo}>
                        <Text size={10}>{keep.name}</Text>
                        {keep.email && <Text size={8}>{keep.email}</Text>}
                    </div>
                    {renderProviders(keep.providers)}
                    <Button
                        border="--emerald-dark"
                        disabled={mergeMutation.isPending}
                        onClick={() => onMerge(keep.id, merge.id)}
                    >
                        <Text>{t('auth.keepThis')}</Text>
                    </Button>
                </div>

                <div className={styles.vs}>VS</div>

                <div className={styles.userCard}>
                    <Image className={styles.avatar} src={merge.image} width={48} height={48} alt="" />
                    <div className={styles.userInfo}>
                        <Text size={10}>{merge.name}</Text>
                        {merge.email && <Text size={8}>{merge.email}</Text>}
                    </div>
                    {renderProviders(merge.providers)}
                    <Button
                        border="--ruby-dark"
                        disabled={mergeMutation.isPending}
                        onClick={() => onMerge(merge.id, keep.id)}
                    >
                        <Text>{t('auth.keepThis')}</Text>
                    </Button>
                </div>
            </div>

            {mergeError && <span className={styles.tip} style={{ color: 'var(--ruby)' }}>{mergeError}</span>}

            <Link href="/auth/account">
                <Text size={8}>{t('common.cancel')}</Text>
            </Link>
        </div>;
    }

    return <div className={styles.page}><Text size={10}>{t('common.loading')}</Text></div>;
}

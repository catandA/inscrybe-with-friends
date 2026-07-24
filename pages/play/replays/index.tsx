import styles from './index.module.css';
import { useRouter } from 'next/router';
import { trpc } from '@/lib/trpc';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';

/**
 * Phase 4 回放系统：回放列表页。
 *
 * 列出当前用户参与过且已结束的对局，点击进入回放查看器。
 */
export default function ReplaysList() {
    const { t } = useTranslation();
    const router = useRouter();
    const replays = trpc.game.listReplayable.useQuery(void 0, {
        refetchOnMount: true,
        refetchOnWindowFocus: false,
    });

    const onOpen = (gameId: string) => {
        router.push(`/play/replays/${gameId}`);
    };

    const onBack = () => {
        router.push('/play');
    };

    return <div className={styles.list}>
        <Box className={styles.header}>
            <Text size={16}>{t('replays.title', { defaultValue: 'Replays' })}</Text>
            <Button onClick={onBack}><Text>{t('common.back', { defaultValue: 'Back' })}</Text></Button>
        </Box>

        <Box className={styles.replayList}>
            {replays.isLoading && <Text>{t('common.loading')}</Text>}
            {replays.data?.length === 0 && (
                <div className={styles.empty}>
                    <Text size={14}>{t('replays.empty', { defaultValue: 'No completed games yet. Play some games to see replays.' })}</Text>
                </div>
            )}
            {(replays.data ?? []).map(replay => (
                <div key={replay.gameId} className={styles.replayRow}>
                    <div className={styles.replayInfo}>
                        <Text size={14}>{replay.playerName} vs {replay.opposingName}</Text>
                        <Text size={12}>
                            {t('replays.endedAt', { defaultValue: 'Ended' })}: {new Date(replay.endedAt).toLocaleString()}
                        </Text>
                        <Text size={12}>
                            {t('replays.youPlayed', { defaultValue: 'You played' })}: {replay.side}
                        </Text>
                    </div>
                    <div className={styles.replayActions}>
                        <Button onClick={() => onOpen(replay.gameId)}>
                            <Text size={12}>{t('replays.watch', { defaultValue: 'Watch' })}</Text>
                        </Button>
                    </div>
                </div>
            ))}
        </Box>
    </div>;
}

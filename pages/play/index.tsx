import styles from './index.module.css';
import classNames from 'classnames';
import { Button } from '@/components/inputs/Button';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { subscribeLobbyList } from '@/lib/socket';

export default function Play() {
    const { t } = useTranslation();
    const router = useRouter();
    const playerships = trpc.lobbies.getOwnPlayerships.useQuery(void 0, {
        refetchOnWindowFocus: false,
    });
    const publicLobbies = trpc.lobbies.listPublic.useQuery(void 0, {
        refetchOnWindowFocus: false,
    });

    const createLobby = trpc.lobbies.create.useMutation({
        onSuccess: (_data, variables) => {
            playerships.refetch();
            // 公开大厅创建后由 triggerLobbyListRefetch 广播，所有客户端刷新 listPublic
            // 这里也手动 refetch 一次，让创建者立即看到
            if (variables?.isPublic) publicLobbies.refetch();
        },
    });
    const onCreatePrivateLobby = () => {
        createLobby.mutate({ isPublic: false });
    };
    const onCreatePublicLobby = () => {
        createLobby.mutate({ isPublic: true });
    };

    // 订阅 lobby-list:refetch 全局广播，公开大厅有任何变化时重拉
    useEffect(() => {
        return subscribeLobbyList(() => {
            publicLobbies.refetch();
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openLobby = (lobbyId: string) => {
        router.push(`/play/lobby/${lobbyId}`);
    };

    return <div className={styles.playMenu}>
        <Box className={styles.lobbies}>
            <Text size={12}>{t('play.lobbies')}</Text>
            <div className={classNames(styles.lobbiesInner, {
                [styles.fetching]: playerships.isFetching,
            })}>
                {playerships.data?.map(playership => (
                    <div key={playership.lobbyId} className={styles.lobby}>
                        <Button className={styles.lobbyBtn} onClick={() => openLobby(playership.lobbyId)}>
                            <Text fit>{playership.lobby.name ?? t('play.lobbyNameFallback', { owner: playership.lobby.owner.name })}</Text>
                        </Button>
                    </div>
                ))}
                {playerships.isFetching && !playerships.data?.length && (
                    <Text>{t('common.loading')}</Text>
                )}
                <div className={styles.createRow}>
                    <Button onClick={onCreatePrivateLobby} disabled={createLobby.isPending} className={styles.newLobby}>
                        <Text>{t('play.createLobby')}</Text>
                    </Button>
                    <Button onClick={onCreatePublicLobby} disabled={createLobby.isPending} className={styles.newLobby}>
                        <Text>{t('play.createPublicLobby')}</Text>
                    </Button>
                </div>
                {createLobby.error && <div className={styles.error}>
                    <Text size={8}>{createLobby.error.message}</Text>
                </div>}
            </div>
        </Box>

        <Box className={styles.publicSection}>
            <Text size={12} className={styles.sectionTitle}>{t('play.publicLobbies')}</Text>
            <div className={styles.publicList}>
                {publicLobbies.isLoading && <Text>{t('common.loading')}</Text>}
                {publicLobbies.data?.length === 0 && (
                    <div className={styles.publicEmpty}>
                        <Text size={8}>{t('play.noPublicLobbies')}</Text>
                    </div>
                )}
                {publicLobbies.data?.map(lobby => (
                    <div
                        key={lobby.id}
                        className={styles.publicLobby}
                        onClick={() => openLobby(lobby.id)}
                    >
                        <div className={styles.publicLobbyInfo}>
                            <span className={styles.publicLobbyName}>
                                {lobby.name ?? t('play.lobbyNameFallback', { owner: lobby.ownerName })}
                            </span>
                            <span className={styles.publicLobbyMeta}>
                                {t('play.publicLobbyMeta', { owner: lobby.ownerName })}
                            </span>
                        </div>
                        <span className={styles.publicLobbyCount}>
                            {t('play.playerCount', { count: lobby.playerCount })}
                        </span>
                    </div>
                ))}
            </div>
        </Box>

        <Box>
            <Button onClick={() => router.push('/play/edit-decks')}>
                <Text>{t('play.editDecks')}</Text>
            </Button>
        </Box>
        <Box>
            <Button onClick={() => router.push('/play/rulesets')}>
                <Text>{t('play.rulesets', { defaultValue: 'Custom Rulesets' })}</Text>
            </Button>
        </Box>
        <Box>
            <Button onClick={() => router.push('/play/replays')}>
                <Text>{t('play.replays', { defaultValue: 'Replays' })}</Text>
            </Button>
        </Box>
    </div>;
}

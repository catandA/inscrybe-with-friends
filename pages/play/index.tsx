import styles from './index.module.css';
import classNames from 'classnames';
import { Button } from '@/components/inputs/Button';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';

export default function Play() {
    const { t } = useTranslation();
    const router = useRouter();
    const playerships = trpc.lobbies.getOwnPlayerships.useQuery(void 0, {
        refetchOnWindowFocus: false,
    });

    const createLobby = trpc.lobbies.create.useMutation({
        onSuccess: () => playerships.refetch(),
    });
    const onCreateLobby = () => {
        createLobby.mutate();
    };

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
                            <Text fit>{playership.lobby.name ?? `${playership.lobby.owner.name}'s Lobby`}</Text>
                        </Button>
                    </div>
                ))}
                {playerships.isFetching && !playerships.data?.length && (
                    <Text>{t('common.loading')}</Text>
                )}
                <Button onClick={onCreateLobby} disabled={createLobby.isPending} className={styles.newLobby}>
                    <Text>{t('play.createLobby')}</Text>
                </Button>
                {createLobby.error && <div className={styles.error}>
                    <Text size={8}>{createLobby.error.message}</Text>
                </div>}
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

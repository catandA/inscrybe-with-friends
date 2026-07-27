import styles from './game.module.css';
import { useRouter } from 'next/router';
import { trpc, trpcProxy } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/hooks/useGameStore';
import { useClientStore } from '@/hooks/useClientStore';
import { createFight } from '@/lib/engine/Fight';
import { clone } from '@/lib/utils';
import { Text } from '@/components/ui/Text';
import { subscribeGameEnd, subscribeGamePacket } from '@/lib/socket';
import { Client } from '@/components/client/Client';
import { Button } from '@/components/inputs/Button';
import { Box } from '@/components/ui/Box';
import { useTranslation } from 'react-i18next';
import { useResolvedRuleset } from '@/hooks/useResolvedRuleset';
import { defaultFightOptions, zFightOptions } from '@/lib/online/z';
import { useMemo } from 'react';

export default function Game() {
    const { t } = useTranslation();
    const router = useRouter();
    const lobbyId = router.query.lobbyId as string;
    const lobby = trpc.lobbies.get.useQuery({
        id: lobbyId,
    }, {
        refetchOnMount: true,
        refetchOnWindowFocus: false,
    });

    const gameId = lobby.data?.gameId ?? null;

    // 解析 lobby 的 ruleset 并注册到运行时 rulesets map。
    // 与 lobby/index.tsx 同理：用户自定义 ruleset 需要从 DB 拉取并 registerRuleset，
    // 否则 Board/Status/CardSelection 等组件访问 rulesets[fight.opts.ruleset].prints 会 undefined。
    const lobbyOptions = useMemo(() => (
        Object.assign(defaultFightOptions(), zFightOptions.partial().parse(lobby.data?.options ?? {}))
    ), [lobby.data?.options]);
    useResolvedRuleset(lobbyOptions.ruleset);

    const game = trpc.game.get.useQuery({ gameId: gameId!, includeInitPacket: true }, {
        refetchOnMount: true,
        enabled: !!gameId,
        refetchOnWindowFocus: false,
    });

    const clientReady = useClientStore(state => !!(gameId && state.clients[gameId])) && !game.isError;

    const [debug, setDebug] = useState(false);
    const [gameEndMessage, setGameEndMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!game.data) return;

        const cloudGame = useGameStore.getState().getCloudGame(game.data.id, true);
        const willPlayInit = game.data.initPacket && !cloudGame.playedInit;

        let client = useClientStore.getState().clients[game.data.id];
        if (!client) {
            const fightData = clone(game.data.fight);
            const fight = willPlayInit ? createFight(fightData.opts, ['player'], fightData.decks) : fightData;
            useClientStore.getState().newClient(game.data.id, fight);
            client = useClientStore.getState().clients[game.data.id]!;
        }

        if (willPlayInit) useGameStore.getState().handleCloudPacket(game.data.id, game.data.initPacket!);

        // Phase 4 断线重连：如果本地记录的 lastSeenPacketId 落后于服务端最新 packet，拉取错过的 packet。
        // 场景：玩家关闭页面/掉线后重新进入游戏，期间对手的动作生成的 packet 未推送。
        // 服务端 fight 状态权威（已通过 game.get 同步），但客户端需要补齐动画连续性。
        const lastSeen = cloudGame.lastSeenPacketId;
        if (lastSeen && game.data.lastPacketId && lastSeen !== game.data.lastPacketId) {
            trpcProxy.game.getPacketsSince.query({
                gameId: game.data.id,
                afterPacketId: lastSeen,
            }).then(result => {
                for (const { id, packet } of result.packets) {
                    useGameStore.getState().handleCloudPacket(game.data.id, packet);
                    useGameStore.getState().markCloudPacketSeen(game.data.id, id);
                }
            }).catch(err => console.warn('Failed to fetch missed packets', err));
        } else if (game.data.lastPacketId) {
            useGameStore.getState().markCloudPacketSeen(game.data.id, game.data.lastPacketId);
        }

        const unsubPackets = subscribeGamePacket(game.data.id, (packet) => {
            useGameStore.getState().handleCloudPacket(game.data.id, packet);
        });
        return unsubPackets;
    }, [game.data]);

    useEffect(() => {
        if (!gameId) return;
        return subscribeGameEnd(gameId, (message) => {
            setGameEndMessage(message);
        });
    }, [gameId, setGameEndMessage]);

    const onBackToLobby = () => {
        router.push(`/play/lobby/${lobbyId}`);
    };

    useEffect(() => {
        const onClientKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'KeyD' && e.shiftKey) setDebug(debug => !debug);
        };
        window.addEventListener('keydown', onClientKeyDown);
        return () => window.removeEventListener('keydown', onClientKeyDown);
    }, []);

    const gameIssue = game.error ? t('game.errorGettingData') :
        !gameId ? t('game.notStarted') :
            !clientReady ? t('common.clientMissing') : t('common.unknownError');

    return <div className={styles.game}> {(clientReady && gameId)
        ? <div className={styles.clientRoot}>
            <Client className={styles.client} id={gameId} debug={debug} />
            {gameEndMessage && <div className={styles.gameEndBackdrop}>
                <Box className={styles.gameEnd}>
                    <Text size={12}>{gameEndMessage}</Text>
                    <Button onClick={onBackToLobby}><Text>{t('common.backToLobby')}</Text></Button>
                </Box>
            </div>}
        </div>
        : (game.isLoading && gameId) ? <Text>{t('game.gettingData')}</Text>
            : <div>
                <Text>{gameIssue}</Text>
                <Button onClick={onBackToLobby}><Text>{t('common.backToLobby')}</Text></Button>
            </div>
    }</div>;
}

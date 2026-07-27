import styles from './spectate.module.css';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { trpc, trpcProxy } from '@/lib/trpc';
import { useGameStore } from '@/hooks/useGameStore';
import { useClientStore } from '@/hooks/useClientStore';
import { createFight } from '@/lib/engine/Fight';
import { clone } from '@/lib/utils';
import { Text } from '@/components/ui/Text';
import { Box } from '@/components/ui/Box';
import { Button } from '@/components/inputs/Button';
import { Client } from '@/components/client/Client';
import { subscribeGameChat, subscribeSpectatorGameEnd, subscribeSpectatorPacket } from '@/lib/socket';
import { useTranslation } from 'react-i18next';
import { ChatBox } from '@/components/chat/ChatBox';
import type { ChatMessagePayload } from '@/server/socket';

/**
 * Phase 4 观战模式：观战者侧页面（中立视角）。
 *
 * 与 `game.tsx` 类似但只读——观战者不能发送 action/response，
 * 只订阅 `private-spectate@{gameId}` 频道接收 packet 推送。
 *
 * 视角为中立（spectate 端点用 translateFightForSpectator 隐藏双方手牌，
 * triggerSpectatorPacket 用 translatePacketForSpectator 隐藏双方手牌事件）。
 * Client 以 readonly 模式渲染，隐藏手牌 UI、禁用交互。
 *
 * 断线重连：用 lastSeenPacketId + getSpectatorPacketsSince 拉取错过的 packet。
 */
export default function Spectate() {
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

    const spectate = trpc.game.spectate.useQuery({
        gameId: gameId!,
        includeInitPacket: true,
    }, {
        refetchOnMount: true,
        enabled: !!gameId,
        refetchOnWindowFocus: false,
    });

    const clientReady = useClientStore(state => !!(gameId && state.clients[gameId])) && !spectate.isError;

    const [gameEndMessage, setGameEndMessage] = useState<string | null>(null);

    // 对局内聊天：观战者也能发言（chat.sendToGame 校验 lobby 成员身份而非 GamePlayer）
    const chatHistory = trpc.chat.historyForGame.useQuery({ gameId: gameId! }, {
        enabled: !!gameId,
        refetchOnWindowFocus: false,
    });
    const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
    useEffect(() => {
        if (chatHistory.data) setChatMessages(chatHistory.data);
    }, [chatHistory.data]);
    const sendChat = trpc.chat.sendToGame.useMutation();
    const onSendChat = async (content: string) => {
        if (!gameId) return;
        await sendChat.mutateAsync({ gameId, lobbyId, content });
    };
    useEffect(() => {
        if (!gameId) return;
        return subscribeGameChat(gameId, (message) => {
            setChatMessages(prev => [...prev, message]);
        });
    }, [gameId]);

    // 初始化 client + spectator game + 拉取错过的 packet（断线重连）
    useEffect(() => {
        if (!spectate.data) return;

        const data = spectate.data;
        const spectatorGame = useGameStore.getState().getSpectatorGame(data.id, true);
        const willPlayInit = data.initPacket && !spectatorGame.playedInit;

        let client = useClientStore.getState().clients[data.id];
        if (!client) {
            const fightData = clone(data.fight);
            const fight = willPlayInit ? createFight(fightData.opts, ['player'], fightData.decks) : fightData;
            useClientStore.getState().newClient(data.id, fight);
            client = useClientStore.getState().clients[data.id]!;
        }

        if (willPlayInit) useGameStore.getState().handleSpectatorPacket(data.id, data.initPacket!);

        // 断线重连：如果本地记录的 lastSeenPacketId 落后于服务端最新 packet，拉取错过的 packet
        // 用 getSpectatorPacketsSince（中立视角，不要求参与者身份）
        const lastSeen = spectatorGame.lastSeenPacketId;
        if (lastSeen && data.lastPacketId && lastSeen !== data.lastPacketId) {
            trpcProxy.game.getSpectatorPacketsSince.query({
                gameId: data.id,
                afterPacketId: lastSeen,
            }).then(result => {
                for (const { id, packet } of result.packets) {
                    useGameStore.getState().handleSpectatorPacket(data.id, packet);
                    useGameStore.getState().markSpectatorPacketSeen(data.id, id);
                }
            }).catch(err => console.warn('Failed to fetch missed spectator packets', err));
        } else if (data.lastPacketId) {
            useGameStore.getState().markSpectatorPacketSeen(data.id, data.lastPacketId);
        }

        const unsubPackets = subscribeSpectatorPacket(data.id, (packet) => {
            useGameStore.getState().handleSpectatorPacket(data.id, packet);
        });
        return unsubPackets;
    }, [spectate.data]);

    // 订阅游戏结束事件
    useEffect(() => {
        if (!gameId) return;
        return subscribeSpectatorGameEnd(gameId, (message) => {
            setGameEndMessage(message);
        });
    }, [gameId, setGameEndMessage]);

    const onBackToLobby = () => {
        router.push(`/play/lobby/${lobbyId}`);
    };

    const gameIssue = spectate.error ? t('spectate.errorGettingData') :
        !gameId ? t('common.notStarted') :
            !clientReady ? t('common.clientMissing') : t('common.unknownError');

    return <div className={styles.spectate}> {(clientReady && gameId)
        ? <div className={styles.clientRoot}>
            <div className={styles.spectatorBadge}>
                <Text size={10}>{t('spectate.badge')}</Text>
            </div>
            <Client className={styles.client} id={gameId} readonly />
            {/* 对局内聊天框：观战者也能发言。默认折叠避免遮挡棋盘。 */}
            {!gameEndMessage && <ChatBox
                className={styles.chatPanel}
                title={t('game.chatTitle')}
                messages={chatMessages}
                onSend={onSendChat}
                defaultCollapsed
            />}
            {gameEndMessage && <div className={styles.gameEndBackdrop}>
                <Box className={styles.gameEnd}>
                    <Text size={12}>{gameEndMessage}</Text>
                    <Button onClick={onBackToLobby}><Text>{t('common.backToLobby')}</Text></Button>
                </Box>
            </div>}
        </div>
        : (spectate.isLoading && gameId) ? <Text>{t('common.loading')}</Text>
            : <div>
                <Text>{gameIssue}</Text>
                <Button onClick={onBackToLobby}><Text>{t('common.backToLobby')}</Text></Button>
            </div>
    }</div>;
}

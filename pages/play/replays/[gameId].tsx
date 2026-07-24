import styles from './[gameId].module.css';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useGameStore } from '@/hooks/useGameStore';
import { useClientStore } from '@/hooks/useClientStore';
import { createFight } from '@/lib/engine/Fight';
import { Client } from '@/components/client/Client';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { useTranslation } from 'react-i18next';

const AUTO_PLAY_INTERVAL_MS = 1500;

/**
 * Phase 4 回放系统：回放查看器。
 *
 * 用 createFight + opts + decks 重建初始空 fight，
 * 然后逐步 addPacket 播放事件序列。
 * Client 以 readonly 模式渲染，隐藏手牌 UI、禁用交互。
 */
export default function ReplayViewer() {
    const { t } = useTranslation();
    const router = useRouter();
    const gameId = router.query.gameId as string;

    const replay = trpc.game.getReplay.useQuery({ gameId }, {
        refetchOnMount: true,
        enabled: !!gameId,
        refetchOnWindowFocus: false,
    });

    const clientReady = useClientStore(state => !!(gameId && state.clients[gameId]));
    const replayCursor = useGameStore(state => state.replayGames[gameId]?.cursor ?? -1);
    const replayPlaying = useGameStore(state => state.replayGames[gameId]?.playing ?? false);
    const replayLength = useGameStore(state => state.replayGames[gameId]?.packets.length ?? 0);
    const clientNonce = useClientStore(state => state.clients[gameId]?.nonce);

    const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 初始化 client + replay game
    useEffect(() => {
        if (!replay.data || !gameId) return;

        const data = replay.data;
        const existingClient = useClientStore.getState().clients[gameId];
        const existingReplay = useGameStore.getState().replayGames[gameId];

        if (!existingClient) {
            // 用 createFight 重建初始空 fight（player 视角，未抽牌状态）
            const fight = createFight(data.opts, ['player'], { player: data.decks.player });
            useClientStore.getState().newClient(gameId, fight);
        }

        if (!existingReplay) {
            useGameStore.getState().newReplayGame(gameId, data.packets);
        }
    }, [replay.data, gameId]);

    // 自动播放
    useEffect(() => {
        if (replayPlaying) {
            playIntervalRef.current = setInterval(() => {
                useGameStore.getState().stepReplay(gameId);
            }, AUTO_PLAY_INTERVAL_MS);
        } else {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
        }
        return () => {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
        };
    }, [replayPlaying, gameId]);

    // 清理：离开页面时删除回放状态
    useEffect(() => {
        return () => {
            if (gameId) {
                useGameStore.getState().setReplayPlaying(gameId, false);
            }
        };
    }, [gameId]);

    const onTogglePlay = () => {
        const game = useGameStore.getState().replayGames[gameId];
        if (!game) return;
        if (game.cursor >= game.packets.length - 1) {
            // 已到末尾，重新开始
            seekTo(0);
            useGameStore.getState().setReplayPlaying(gameId, true);
        } else {
            useGameStore.getState().setReplayPlaying(gameId, !game.playing);
        }
    };

    const onStep = () => {
        useGameStore.getState().setReplayPlaying(gameId, false);
        useGameStore.getState().stepReplay(gameId);
    };

    const onBack = () => {
        router.push('/play/replays');
    };

    // seek 到指定位置：重置 client + 直接 commit 事件到 cursor
    const seekTo = (cursor: number) => {
        const game = useGameStore.getState().replayGames[gameId];
        if (!game || !replay.data) return;
        const clamped = Math.max(-1, Math.min(cursor, game.packets.length - 1));

        // 重置 client
        useClientStore.getState().deleteClient(gameId);
        const fight = createFight(replay.data.opts, ['player'], { player: replay.data.decks.player });
        useClientStore.getState().newClient(gameId, fight);

        // 直接 commit 0 到 clamped 的所有事件（不走动画队列）
        for (let i = 0; i <= clamped; i++) {
            const events = game.packets[i].packet.settled;
            useClientStore.getState().commitEventsDirect(gameId, [...events]);
        }

        useGameStore.getState().seekReplay(gameId, clamped);
    };

    const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const game = useGameStore.getState().replayGames[gameId];
        if (!game || game.packets.length === 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const targetCursor = Math.floor(ratio * game.packets.length) - 1;
        useGameStore.getState().setReplayPlaying(gameId, false);
        seekTo(targetCursor);
    };

    const onRestart = () => {
        useGameStore.getState().setReplayPlaying(gameId, false);
        seekTo(-1);
    };

    if (replay.isLoading) {
        return <div className={styles.viewer}><Text>{t('common.loading')}</Text></div>;
    }

    if (replay.error) {
        return <div className={styles.viewer}>
            <Box>
                <Text size={14}>{replay.error.message}</Text>
                <Button onClick={onBack}><Text>{t('common.back', { defaultValue: 'Back' })}</Text></Button>
            </Box>
        </div>;
    }

    if (!replay.data || !clientReady) {
        return <div className={styles.viewer}><Text>{t('common.loading')}</Text></div>;
    }

    const progress = replayLength > 0 ? (replayCursor + 1) / replayLength : 0;
    const isAtEnd = replayCursor >= replayLength - 1;

    return <div className={styles.viewer}>
        <div className={styles.clientRoot}>
            <Client className={styles.client} id={gameId} key={clientNonce} readonly />
        </div>
        <Box className={styles.controls}>
            <div className={styles.controlRow}>
                <Button onClick={onBack}><Text size={12}>{t('common.back', { defaultValue: 'Back' })}</Text></Button>
                <Button onClick={onRestart} disabled={replayCursor < 0}><Text size={12}>{t('replays.restart', { defaultValue: '⟲' })}</Text></Button>
                <Button onClick={onStep} disabled={isAtEnd}><Text size={12}>{t('replays.step', { defaultValue: '▶|' })}</Text></Button>
                <Button onClick={onTogglePlay}><Text size={12}>{replayPlaying ? t('replays.pause', { defaultValue: '⏸' }) : t('replays.play', { defaultValue: '▶' })}</Text></Button>
                <Text size={12}>{replayCursor + 1} / {replayLength}</Text>
            </div>
            <div className={styles.progress} onClick={onSeek}>
                <div className={styles.progressBar} style={{ width: `${progress * 100}%` }} />
            </div>
            <Text size={10} className={styles.playerInfo}>
                {replay.data.playerName} vs {replay.data.opposingName}
            </Text>
        </Box>
    </div>;
}

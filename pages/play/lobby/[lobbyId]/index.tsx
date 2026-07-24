import styles from './index.module.css';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/router';
import { Text } from '@/components/ui/Text';
import { Box } from '@/components/ui/Box';
import Image from 'next/image';
import { Select } from '@/components/inputs/Select';
import { Button } from '@/components/inputs/Button';
import { useEffect, useMemo, useRef } from 'react';
import { pusherClient } from '@/lib/pusher';
import { defaultFightOptions, zFightOptions } from '@/lib/online/z';
import { stringify } from 'yaml';
import { FightSide } from '@/lib/engine/Fight';
import { rulesets, userRulesetKey } from '@/lib/defs/prints';
import { entries } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export default function Lobby() {
    const { t } = useTranslation();
    const router = useRouter();
    const lobbyId = router.query.lobbyId as string;
    const lobby = trpc.lobbies.get.useQuery({
        id: lobbyId,
    }, {
        refetchOnMount: true,
        refetchOnWindowFocus: false,
    });
    const user = trpc.user.getUser.useQuery(void 0, {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const lobbyExistedRef = useRef(false);
    useEffect(() => {
        if (lobby.data) lobbyExistedRef.current = true;
    }, [lobby.data]);

    const pending = lobby.isLoading || user.isLoading;
    const isInGame = !pending && lobby.data?.playerships.some(p => p.userId === user.data?.id);
    const isOwner = !pending && lobby.data?.ownerId === user.data?.id;

    const player = lobby.data?.playerships.find(p => p.userId.toString() === lobby.data?.sides.player);
    const opposing = lobby.data?.playerships.find(p => p.userId.toString() === lobby.data?.sides.opposing);

    const decks = trpc.decks.getOwn.useQuery(void 0, {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    // Phase 3.4：拉取用户 rulesets，让 owner 可在 lobby 选择自定义 ruleset
    const userRulesets = trpc.rulesets.list.useQuery(void 0, {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const hasGame = !!(!pending && lobby.data?.gameId);

    // Phase 4 观战模式：判断当前用户是否为游戏参与者。
    // 非参与者点击 Enter Game 会被服务端 game.get 端点拒绝（FORBIDDEN），
    // 因此在 UI 层提前区分：参与者显示 Enter Game，非参与者显示 Spectate Game。
    const isGameParticipant = !pending && !!user.data && (
        player?.userId === user.data.id || opposing?.userId === user.data.id
    );

    // 解析当前 lobby 的 ruleset（内置直接返回，用户 ruleset 用 synthetic key）
    const lobbyOptions = useMemo(() => (
        Object.assign(defaultFightOptions(), zFightOptions.partial().parse(lobby.data?.options ?? {}))
    ), [lobby.data?.options]);
    const currentRuleset = lobbyOptions.ruleset;

    // 内置 + 用户 rulesets 的选项列表
    const rulesetOptions = useMemo(() => {
        const builtin = entries(rulesets).map(([id, r]) => [id, r.name] as [string, string]);
        const user = (userRulesets.data ?? []).map(r => [userRulesetKey(r.id), `${r.name} (custom)`] as [string, string]);
        return [...builtin, ...user];
    }, [userRulesets.data]);

    const changeOptions = trpc.lobbies.changeOptions.useMutation({ onSuccess: () => lobby.refetch() });
    const onSelectRuleset = (id: string) => {
        if (id === currentRuleset) return;
        changeOptions.mutate({ id: lobbyId, options: { ruleset: id } });
    };

    const canStartGame = !pending && player && opposing && player !== opposing
        && lobby.data?.decks && lobby.data.decks[`${player.userId}`] && lobby.data.decks[`${opposing.userId}`];

    useEffect(() => {
        const channelId = `private-lobby@${lobbyId}`;
        const channel = pusherClient.subscribe(channelId);
        channel.bind('refetch', ({ from }: { from: string }) => {
            if (from !== user.data?.id) lobby.refetch();
        });
        channel.bind('game-start', () => {
            onEnterGame();
        });
        return () => pusherClient.unsubscribe(channelId);
    }, [lobbyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const deleteLobby = trpc.lobbies.delete.useMutation({ onSuccess: () => router.push('/play') });
    const onDeleteLobby = () => deleteLobby.mutate({ id: lobbyId });

    const joinLobby = trpc.lobbies.join.useMutation({ onSuccess: () => lobby.refetch() });
    const onJoinLobby = () => joinLobby.mutate({ id: lobbyId });

    const leaveLobby = trpc.lobbies.leave.useMutation({ onSuccess: () => lobby.refetch() });
    const onLeaveLobby = () => leaveLobby.mutate({ id: lobbyId });

    const setPlayerSide = trpc.lobbies.setPlayerSide.useMutation({ onSuccess: () => lobby.refetch() });
    const onSetPlayerSide = (userId: string, side: FightSide) => {
        if (lobby.data?.sides[side] === userId) return;
        setPlayerSide.mutate({ id: lobbyId, side, userId });
    };

    const selectOwnDeck = trpc.lobbies.selectOwnDeck.useMutation({ onSuccess: () => lobby.refetch() });
    const onSelectDeck = (deckName: string) => {
        if (user.data && lobby.data?.decks[user.data.id] === deckName) return;
        selectOwnDeck.mutate({ id: lobbyId, deck: deckName });
    };

    const startGame = trpc.game.start.useMutation({ onSuccess: () => lobby.refetch() });
    const onStartGame = () => {
        if (!canStartGame) return;
        startGame.mutate({ lobbyId });
    };

    const onEnterGame = () => {
        router.push(`/play/lobby/${lobbyId}/game`);
    };

    // Phase 4 观战模式：非游戏参与者可点击进入观战页面，只读观看对战。
    const onSpectateGame = () => {
        router.push(`/play/lobby/${lobbyId}/spectate`);
    };

    const forfeitGame = trpc.game.forfeit.useMutation({ onSuccess: () => lobby.refetch() });
    const onForfeitGame = () => {
        if (!lobby.data) return;
        forfeitGame.mutate({ lobbyId: lobby.data.id });
    };

    // TODO: error handling

    return <div className={styles.lobby}>
        {lobby.data && <div className={styles.panels}>
            <Box>
                <Text size={12}>{t('lobby.lobby')}</Text>
                {/* TODO: Lobby settings editor */}
                <Text size={11}>{t('lobby.ruleset')}</Text>
                {isOwner && !hasGame ? <Select
                    options={rulesetOptions}
                    className={styles.select}
                    placeholder={t('lobby.selectRulesetPlaceholder')}
                    disabled={changeOptions.isPending || userRulesets.isLoading}
                    value={currentRuleset}
                    onSelect={onSelectRuleset}
                /> : <Text>{rulesets[currentRuleset]?.name ?? currentRuleset}</Text>}
                <Text size={10}>{stringify(lobbyOptions)}</Text>
                {isOwner && <>
                    <Button
                        disabled={deleteLobby.isPending}
                        onClick={onDeleteLobby}
                    ><Text>{t('lobby.deleteLobby')}</Text></Button>
                    {deleteLobby.error && <Text>{deleteLobby.error.message}</Text>}
                </>}
            </Box>
            <Box>
                <Text size={12}>{t('lobby.game')}</Text>
                <div className={styles.vs}>
                    {(isOwner && !hasGame) ? <Select
                        options={lobby.data.playerships.map(p => [p.userId, p.user.name])}
                        className={styles.select}
                        placeholder={t('lobby.selectPlayerPlaceholder')}
                        disabled={setPlayerSide.isPending}
                        onSelect={id => onSetPlayerSide(id, 'player')}
                        value={player?.userId.toString() ?? ''}
                    /> : <Text size={16}>{player?.user.name ?? '...'}</Text>}
                    <Text>{t('common.vs')}</Text>
                    {(isOwner && !hasGame) ? <Select
                        options={lobby.data.playerships.map(p => [p.userId, p.user.name])}
                        className={styles.select}
                        placeholder={t('lobby.selectPlayerPlaceholder')}
                        disabled={setPlayerSide.isPending}
                        onSelect={id => onSetPlayerSide(id, 'opposing')}
                        value={opposing?.userId.toString() ?? ''}
                    /> : <Text size={16}>{opposing?.user.name ?? '...'}</Text>}
                </div>
                {(isOwner && !hasGame) && (
                    <Button
                        disabled={!canStartGame || startGame.isPending}
                        onClick={onStartGame}
                    ><Text>{t('lobby.startGame')}</Text></Button>
                )}
                {hasGame && isGameParticipant && (
                    <Button
                        onClick={onEnterGame}
                    ><Text>{t('lobby.enterGame')}</Text></Button>
                )}
                {hasGame && !isGameParticipant && (
                    <Button
                        onClick={onSpectateGame}
                    ><Text>{t('lobby.spectateGame')}</Text></Button>
                )}
                {(isInGame && hasGame) && (
                    <Button
                        onClick={onForfeitGame}
                    ><Text>{t('lobby.forfeitGame')}</Text></Button>
                )}
            </Box>
            <Box className={styles.playerPanel}>
                <Text size={12}>{t('lobby.players')}</Text>
                {lobby.data.playerships.map(playership => (
                    <div key={playership.userId} className={styles.playerRow}>
                        <div className={styles.player}>
                            <Image
                                alt={`${playership.user.name}'s profile picture`}
                                src={playership.user.image}
                                width={32}
                                height={32}
                                className={styles.profilePicture}
                            />
                            <Text>{playership.user.name}{playership.user.id === lobby.data?.ownerId ? t('lobby.leaderBadge') : ''}</Text>
                        </div>
                        {Object.values(lobby.data!.sides).includes(`${playership.userId}`)
                        && (playership.userId === user.data?.id ? <Select
                            className={styles.selectDeck}
                            options={decks.data?.map(d => [d.name, d.name]) ?? []}
                            placeholder={t('lobby.selectDeckPlaceholder')}
                            value={lobby.data?.decks[playership.userId] ?? ''}
                            onSelect={onSelectDeck}
                            disabled={selectOwnDeck.isPending || decks.isLoading}
                            readonly={hasGame}
                        /> : <Select
                            className={styles.selectDeck}
                            options={(() => {
                                const deckName = lobby.data?.decks[playership.userId];
                                return deckName ? [[deckName, deckName]] : [];
                            })()}
                            placeholder={t('lobby.noDeckSelectedPlaceholder')}
                            value={lobby.data?.decks[playership.userId] ?? ''}
                            readonly
                        />)}
                    </div>
                ))}
                {isInGame ? (
                    <Button
                        disabled={hasGame || pending || isOwner || leaveLobby.isPending}
                        onClick={onLeaveLobby}
                    ><Text>{t('lobby.leaveGame')}</Text></Button>
                ) : (
                    <Button
                        disabled={pending || isInGame || joinLobby.isPending}
                        onClick={onJoinLobby}
                    ><Text>{t('lobby.joinGame')}</Text></Button>
                )}
            </Box>
        </div>}
        {lobby.isFetched && !lobby.data && <Box>
            <Text size={12}>{lobbyExistedRef.current ? t('lobby.lobbyDeleted') : t('lobby.lobbyNotFound')}</Text>
        </Box>}
    </div>;
}

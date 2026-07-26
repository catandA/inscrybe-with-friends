import { DevMenu } from '@/components/DevMenu';
import styles from './playtest.module.css';
import { Text } from '@/components/ui/Text';
import { Client } from '@/components/client/Client';
import { Button } from '@/components/inputs/Button';
import { Select } from '@/components/inputs/Select';
import { Box } from '@/components/ui/Box';
import { useClientStore } from '@/hooks/useClientStore';
import { useDeckSync } from '@/hooks/useDeckStore';
import { useGameStore } from '@/hooks/useGameStore';
import { useStore } from '@/hooks/useStore';
import { FIGHT_SIDES, FightSide, createFight, translateFight } from '@/lib/engine/Fight';
import { createFightHost } from '@/lib/engine/Host';
import { oppositeSide } from '@/lib/engine/utils';
import { clone, entries, fromEntries } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { rulesets } from '@/lib/defs/prints';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

export default function PlayTest() {
    // 用 FallbackComponent 而非 fallbackRender：ErrorBoundary 是 class 组件，
    // fallbackRender 在 render() 内直接调用，不能用 hooks（useTranslation 会触发 React #321）。
    // FallbackComponent 被当作独立组件渲染，hooks 合法。
    return <ErrorBoundary FallbackComponent={TheError}>
        <PlayTestPage />
    </ErrorBoundary>;
}

function TheError({ error }: FallbackProps) {
    const { t } = useTranslation();
    const onTryFix = () => {
        useGameStore.getState().deleteLocalGame('playtest');
        window.location.reload();
    };

    const message = (error?.stack ?? `${error}`).split('\n').slice(0, 5).join('\n');

    return <Box>
        <div>
            <Text size={14}>{t('playtest.veryBroken')}</Text>
            <Text className={styles.borkStack}>{message}</Text>
            <Button onClick={onTryFix}><Text size={20}>{t('playtest.deleteAndRefresh')}</Text></Button>
        </div>
    </Box>;
}

function PlayTestPage() {
    const { t } = useTranslation();
    const { decks: deckStore } = useDeckSync();
    const game = useStore(useGameStore, state => state.localGames.playtest);
    const currentTurn = useStore(useGameStore, state => state.localGames.playtest?.host.fight.turn.side);
    const currentPhase = useStore(useGameStore, state => state.localGames.playtest?.host.fight.turn.phase);
    const clientNonce = useStore(useClientStore, state => state.clients.playtest?.nonce);

    const [ruleset, setRuleset] = useState<string>();
    const [selectedDecks, setSelectedDecks] = useState<Record<FightSide, string | null>>({
        player: null,
        opposing: null,
    });
    const [currentSide, setCurrentSide] = useState<FightSide>('player');
    const [autoSwitch, setAutoSwitch] = useState(false);
    const [skipDraw, setSkipDraw] = useState(false);
    const [devMode, setDevMode] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    const decks = useMemo(() => {
        if (!ruleset) return [];
        return entries(deckStore).map(([id, { local, name }]) => ({ id, name, deck: local }));
    }, [deckStore, ruleset]);

    const noDecks = !decks.length;

    const onChangeRuleset = (id: string) => {
        setRuleset(id);
        setSelectedDecks({
            player: null,
            opposing: null,
        });
    };

    useEffect(() => {
        if (currentTurn && currentSide !== currentTurn && autoSwitch) {
            setCurrentSide(currentTurn);
        }
    }, [currentTurn, autoSwitch, currentSide]);
    useEffect(() => {
        if (currentPhase === 'draw' && skipDraw) {
            useGameStore.getState().createEvent('playtest', {
                type: 'phase',
                phase: 'play',
            });
        }
    }, [currentPhase, skipDraw]);

    useEffect(() => {
        if (!game) return;

        if (game.forceTranslate !== currentSide) {
            useGameStore.getState().setLocalGame('playtest', game => ({ ...game, forceTranslate: currentSide }));
            const fight = translateFight(clone(game.host.fight), currentSide);
            useClientStore.getState().newClient('playtest', fight);
        } else if (!useClientStore.getState().clients.playtest) {
            const fight = translateFight(clone(game.host.fight), currentSide);
            useClientStore.getState().newClient('playtest', fight);
        }
    }, [game, currentSide]);

    const onFightStart = () => {
        if (game || !ruleset || !deckStore || Object.values(selectedDecks).some(deck => !deck)) return;

        const decks = fromEntries(entries(selectedDecks).map(([side, deckId]) => [side, deckStore[deckId!].local]));

        const fight = createFight({
            features: [],
            hammersPerTurn: 1,
            lanes: 4,
            lives: 2,
            startingHand: 3,
            ruleset: 'imfComp',
            antLimit: 2,
            maxEnergy: 6,
            numCandles: 2,
            startingBones: 0,
            deckSizeMin: 1,
            variableAttackNerf: false,
            maxCommonsMain: 4,
            maxCommonsSide: 10,
            optActives: false,
            allowSnuffingCandles: false,
            snuffCard: 'greaterSmoke',
        }, FIGHT_SIDES, decks);
        const host = createFightHost(fight);

        useGameStore.getState().newLocalGame('playtest', host);
        useGameStore.getState().setLocalGame('playtest', (game) => ({ ...game, forceTranslate: currentSide }));
        useClientStore.getState().newClient('playtest', translateFight(clone(fight), currentSide));
        useGameStore.getState().startHost('playtest');
    };
    const onKillGame = () => {
        if (!game) return;

        useGameStore.getState().deleteLocalGame('playtest');
        useClientStore.getState().deleteClient('playtest');
    };
    const onSwitchSide = () => {
        if (!game) return;

        setCurrentSide(side => oppositeSide(side));
    };
    const toggleAutoSwitch = () => {
        setAutoSwitch(auto => !auto);
    };
    const toggleSkipDraw = () => {
        setSkipDraw(skip => !skip);
    };

    useEffect(() => {
        const listener = () => {
            setFullscreen(Math.abs(window.innerHeight - screen.height) < 30);
        };
        window.addEventListener('resize', listener);
        listener();
        return () => window.removeEventListener('resize', listener);
    }, []);

    return <div className={styles.playtest}>
        {!game ? <div className={styles.startOptions}>
            <Select
                options={entries(rulesets).map(([id, ruleset]) => [id, ruleset.name])}
                placeholder={t('playtest.selectRulesetPlaceholder')}
                onSelect={onChangeRuleset}
                value={ruleset}
            />
            {FIGHT_SIDES.map(side => <div key={side}>
                <Text>{side === 'player' ? t('playtest.sidePlayer') : t('playtest.sideOpposing')}</Text>
                <Select
                    options={decks.map((deck) => [deck.id, deck.name])}
                    disabled={noDecks}
                    placeholder={noDecks ? t('playtest.noDecks') : t('playtest.selectDeckPlaceholder')}
                    onSelect={deckId => setSelectedDecks({ ...selectedDecks, [side]: deckId })}
                    value={selectedDecks[side]}
                />
            </div>)}
            <Button
                disabled={Object.values(selectedDecks).some(deck => !deck)}
                onClick={onFightStart}
            ><Text size={14}>{t('playtest.startFight')}</Text></Button>
        </div> : <div className={classNames(styles.gameRoot, {
            [styles.fullscreen]: fullscreen,
        })} style={{ position: 'relative' }}>
            <Box className={styles.controlsBox}>
                <div className={styles.controls}>
                    <Button onClick={onKillGame}><Text>{t('playtest.killGame')}</Text></Button>
                    <Button onClick={onSwitchSide}><Text>{t('playtest.switchSide')}</Text></Button>
                    <Button onClick={toggleAutoSwitch}><Text>{autoSwitch ? t('playtest.autoSwitchOn') : t('playtest.autoSwitchOff')}</Text></Button>
                    <Button onClick={toggleSkipDraw}><Text>{skipDraw ? t('playtest.skipDrawOn') : t('playtest.skipDrawOff')}</Text></Button>
                    <Button onClick={() => setDevMode(true)}><Text>{t('playtest.devMenu')}</Text></Button>
                    <Text>{t('playtest.playingAs')} <span style={{ textTransform: 'uppercase' }}>{currentSide}</span></Text>
                </div>
            </Box>
            <Client className={styles.client} key={clientNonce} id="playtest" debug={!fullscreen} />
            {devMode && <DevMenu id="playtest" onClose={() => setDevMode(false)} />}
        </div>}
    </div>;
}

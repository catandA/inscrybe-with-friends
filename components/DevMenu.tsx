import styles from './DevMenu.module.css';
import { useCallback, useState } from 'react';
import { Text } from './ui/Text';
import { Button } from './inputs/Button';
import { PrintList } from './ui/PrintList';
import { useGameStore } from '@/hooks/useGameStore';
import { initCardFromPrint } from '@/lib/engine/Card';
import { rulesets } from '@/lib/defs/prints';
import { useClientStore } from '@/hooks/useClientStore';
import { useTranslation } from 'react-i18next';

export interface DevMenuProps {
    id: string
    onClose?: () => void
}
export function DevMenu({ id, onClose }: DevMenuProps) {
    const { t } = useTranslation();
    const ruleset = useClientStore(state => state.clients[id]?.fight.opts.ruleset);
    const prints = ruleset ? rulesets[ruleset].prints : null;

    const [spawning, setSpawning] = useState(false);
    const onSpawnCard = useCallback((printId: string) => {
        if (!prints) return;
        useGameStore.getState().createEvent(id, {
            type: 'draw',
            side: 'player',
            card: initCardFromPrint(prints, printId),
        });
    }, [id, prints]);
    const onGiveEnergy = () => {
        useGameStore.getState().createEvent(id, {
            type: 'energy',
            side: 'player',
            amount: 1,
        });
    };
    const onGiveBone = () => {
        useGameStore.getState().createEvent(id, {
            type: 'bones',
            side: 'player',
            amount: 1,
        });
    };

    return <div className={styles.menu}>
        <div className={styles.actions}>
            <Button onClick={onClose}><Text size={14}>{t('dev.close')}</Text></Button>
            <Button onClick={() => setSpawning(true)} disabled={!prints}><Text size={14}>{t('dev.spawnCard')}</Text></Button>
            <Button onClick={onGiveEnergy}><Text size={14}>{t('dev.energyPlus1')}</Text></Button>
            <Button onClick={onGiveBone}><Text size={14}>{t('dev.bonesPlus1')}</Text></Button>
        </div>
        {spawning && ruleset && <div className={styles.prints}>
            <PrintList editable onSelect={onSpawnCard} showNames ruleset={ruleset} />
        </div>}
    </div>;
}

import type { Event } from '@/lib/engine/Events';
import styles from './Debug.module.css';
import { forwardRef, memo } from 'react';
import { animationDurations, useClient } from '@/hooks/useClientStore';
import { Text } from '../ui/Text';
import { Box } from '../ui/Box';
import { stringify } from 'yaml';
import { useTranslation } from 'react-i18next';

export const DebugEvents = memo(function DebugEvents() {
    const { t } = useTranslation();
    const client = useClient(true);
    const settledRef = (el: HTMLDivElement | null) => {
        el?.lastElementChild?.scrollIntoView();
    };

    return <div className={styles.events}>
        <div className={styles.stack}>
            {client.queue.map((event, i) => <Event key={i} event={event} i={client.settled.length + i} />)}
        </div>
        <div className={styles.separator}>
            <Text>{t('debug.queue')}</Text>
            <div className={styles.divider} />
            <Text>{t('debug.settled')}</Text>
        </div>
        <div className={styles.stack} ref={settledRef}>
            {client.settled.map((event, i) => <Event key={i} event={event} i={i} />)}
        </div>
    </div>;
});


export const DebugInfo = memo(function DebugInfo() {
    const { t } = useTranslation();
    const client = useClient(true);

    const displaySide = client.fight.turn.side === 'player' ? t('debug.yours') : t('debug.theirs');

    return <div className={styles.info}>
        <Text>{t('debug.turnLabel')}<span style={{
            color: client.fight.turn.side === 'player' ? 'var(--ui)' : 'inherit',
        }}>{displaySide}</span>{t('debug.phaseLabel')}<span className={styles.phase}>{client.fight.turn.phase}</span></Text>
        {client.animating && (
            <div className={styles.present} key={client.queue.length}>
                <div className={styles.progressBar}><div className={styles.progress} style={{
                    animationDuration: `${animationDurations[client.animating.event.type]}s`,
                }} /></div>
                <Text className={styles.presentLabel}>{client.animating.event.type}</Text>
            </div>
        )}
    </div>;
});

interface EventProps {
    event: Event;
    i: number;
}
const Event = forwardRef<HTMLDivElement, EventProps>(function Event({ event, i }, ref) {
    const { type, ...data } = event;
    return <Box className={styles.event} ref={ref}>
        <div className={styles.eventHeader}>
            <Text className={styles.eventType}>{type}</Text>
            <Text>{i}</Text>
        </div>
        <pre className={styles.eventDetails}>{stringify(data, {}).trim()}</pre>
    </Box>;
});

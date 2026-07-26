import styles from './Client.module.css';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { ClientContext, animationDurations, useClientStore } from '@/hooks/useClientStore';
import { CSSProperties, memo, useEffect } from 'react';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';
import { Board } from './Board';
import { LeftInfo } from './LeftInfo';
import { RightInfo } from './RightInfo';
import { Hand } from './Hand';
import { DebugEvents, DebugInfo } from './Debug';
import { NSlice } from '../ui/NSlice';
import { useBattleSheet } from '@/hooks/useBattleTheme';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

export interface ClientProps {
    id: string
    className?: string
    debug?: boolean
    /**
     * Phase 4 观战/回放模式：隐藏手牌 UI、禁用所有交互。
     * 用于观战频道和回放查看器，避免观战者误操作或泄露手牌信息。
     */
    readonly?: boolean
}
export const Client = memo(function Client({ id, className, debug, readonly }: ClientProps) {
    const { t } = useTranslation();
    const battleThemes = useBattleSheet();
    const client = useClientStore(state => state.clients[id]);

    const onDismissError = () => {
        useClientStore.getState().setClient(id, client => ({ ...client, errors: client.errors.slice(1) }));
    };

    const animationVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(animationDurations)) {
        animationVars[`--event-${key}-duration`] = `${value}s`;
    }

    useEffect(() => {
        return useClientStore.getState().onUIOpen(id);
    }, [id]);

    return <div className={classNames(styles.root, className)} data-readonly={readonly || null}>
        <ErrorBoundary FallbackComponent={ClientError}>
            {client ? <div className={styles.client} style={{
                '--lane-count': client.fight.opts.lanes,
                ...animationVars,
            } as CSSProperties}>
                <ClientContext.Provider value={id}>
                    <LeftInfo />
                    <Board readonly={readonly} />
                    <RightInfo />
                    <NSlice
                        className={styles.middle}
                        sheet={battleThemes}
                        name="middle"
                        cols={[0]}
                        rows={[4]}
                    />
                    {/* readonly 模式隐藏手牌区，避免观战者看到玩家手牌 */}
                    {!readonly && <Hand />}
                    {debug && <><DebugEvents /><DebugInfo /></>}
                    {client.errors[0] != null && <div className={styles.errorBackdrop} onClick={onDismissError}>
                        <div className={styles.error} onClick={e => e.stopPropagation()}>
                            <Box>
                                <Text size={12}>{client.errors[0]}</Text>
                            </Box>
                        </div>
                    </div>}
                </ClientContext.Provider>
            </div> : <Box className={styles.missing}>
                <Text size={20}>{t('client.missing')}</Text>
            </Box>}
        </ErrorBoundary>
    </div>;
});

const realTrace = /^ *at ([\w$.]+) \((?:[\w\-]+:\/\/\/?)?(.+?\.tsx?):(\d+):(\d+)\)$/;
const ClientError = ({ error }: FallbackProps) => {
    const { t } = useTranslation();
    let stack: string[] = [];
    if (error instanceof Error && error.stack) {
        for (const line of error.stack.split('\n').slice(1))
            if (realTrace.test(line)) stack.push(line.replace(realTrace, '$1 @ $2:$3:$4'));
    }
    return <Box className={styles.missing}>
        <Text size={20}>{t('client.error')}</Text>
        <Text size={14}>{`${error}`}</Text>
        {stack.map((line, i) => <Text key={i}>{line}</Text>)}
    </Box>;
};

import styles from './[rulesetId].module.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { trpc } from '@/lib/trpc';
import { rulesets } from '@/lib/defs/prints';
import { entries } from '@/lib/utils';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { Select } from '@/components/inputs/Select';
import { defaultFightOptions } from '@/lib/online/z';
import { FightOptions } from '@/lib/engine/Fight';
import { UserRulesetData } from '@/lib/engine/Card';
import { useTranslation } from 'react-i18next';

/**
 * Phase 3.2：规则集编辑页。
 *
 * 布局：
 * - 头部：名称编辑 + 保存/删除按钮
 * - FightOptions 区：数值字段（Range/数字输入）+ 布尔字段（toggle）
 * - 卡牌覆盖区：按 base ruleset 的 prints 列出，每行可覆盖 power/health/banned/sigils
 *
 * 数据流：
 * - 本地 state 保存 UserRulesetData（options + prints 覆盖）
 * - 保存时调用 trpc.rulesets.update
 * - 加载时从 DB 读取 data 作为初始值
 */
export default function RulesetEditor() {
    const { t } = useTranslation();
    const router = useRouter();
    const rulesetId = router.query.rulesetId as string;

    const rulesetQuery = trpc.rulesets.get.useQuery(
        { id: rulesetId },
        { enabled: !!rulesetId, refetchOnWindowFocus: false },
    );

    const [name, setName] = useState('');
    const [data, setData] = useState<UserRulesetData>({});
    const [filter, setFilter] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // 加载 DB 数据到本地 state
    useEffect(() => {
        if (rulesetQuery.data && !loaded) {
            setName(rulesetQuery.data.name);
            setData((rulesetQuery.data.data as UserRulesetData) ?? {});
            setLoaded(true);
        }
    }, [rulesetQuery.data, loaded]);

    const updateRuleset = trpc.rulesets.update.useMutation({
        onSuccess: () => {
            setSaveMsg({ ok: true, text: t('rulesets.saved', { defaultValue: 'Saved' }) });
            rulesetQuery.refetch();
            setTimeout(() => setSaveMsg(null), 2000);
        },
        onError: (err) => {
            setSaveMsg({ ok: false, text: err.message });
        },
    });
    const deleteRuleset = trpc.rulesets.delete.useMutation({
        onSuccess: () => router.push('/play/rulesets'),
    });

    if (!rulesetQuery.data) {
        if (rulesetQuery.isLoading) {
            return <div className={styles.editor}><Text>{t('common.loading')}</Text></div>;
        }
        return <div className={styles.editor}><Box><Text>Ruleset not found</Text></Box></div>;
    }

    const baseId = rulesetQuery.data.baseRuleset;
    const base = rulesets[baseId];
    const baseOpts = defaultFightOptions(baseId);
    if (!base) {
        return <div className={styles.editor}><Box><Text>Unknown base ruleset: {baseId}</Text></Box></div>;
    }

    const currentOpts = { ...baseOpts, ...(data.options as Partial<FightOptions>), ruleset: baseId } as FightOptions;

    const onSave = () => {
        updateRuleset.mutate({ id: rulesetId, name: name.trim(), data });
    };
    const onDelete = () => {
        if (confirm(t('rulesets.confirmDelete', { defaultValue: 'Delete this ruleset?' }))) {
            deleteRuleset.mutate({ id: rulesetId });
        }
    };

    // ===== FightOptions 编辑 =====
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setOpt = (key: keyof Omit<FightOptions, 'ruleset'>, value: any) => {
        setData(d => ({
            ...d,
            options: { ...d.options, [key]: value } as Partial<Omit<FightOptions, 'ruleset'>>,
        }));
    };
    const isOptModified = (key: keyof Omit<FightOptions, 'ruleset'>) =>
        data.options?.[key] !== undefined && data.options?.[key] !== baseOpts[key];

    const numFields: { key: keyof Omit<FightOptions, 'ruleset'>; label: string; min: number; max: number }[] = [
        { key: 'lanes', label: 'Lanes', min: 1, max: 8 },
        { key: 'lives', label: 'Lives (candles)', min: 1, max: 10 },
        { key: 'startingHand', label: 'Starting Hand', min: 0, max: 10 },
        { key: 'hammersPerTurn', label: 'Hammers per Turn', min: 0, max: 5 },
        { key: 'antLimit', label: 'Ant Limit', min: 0, max: 6 },
        { key: 'maxEnergy', label: 'Max Energy', min: 1, max: 12 },
        { key: 'numCandles', label: 'Num Candles', min: 1, max: 10 },
        { key: 'startingBones', label: 'Starting Bones', min: 0, max: 20 },
        { key: 'deckSizeMin', label: 'Deck Size Min', min: 1, max: 40 },
        { key: 'maxCommonsMain', label: 'Max Commons (Main)', min: 0, max: 10 },
        { key: 'maxCommonsSide', label: 'Max Commons (Side)', min: 0, max: 20 },
    ];

    const boolFields: { key: keyof Omit<FightOptions, 'ruleset'>; label: string }[] = [
        { key: 'variableAttackNerf', label: 'Variable Attack Nerf' },
        { key: 'optActives', label: 'Optional Actives' },
        { key: 'allowSnuffingCandles', label: 'Allow Snuffing Candles' },
    ];

    // ===== 卡牌覆盖编辑 =====
    const printEntries = entries(base.prints);
    const filteredPrints = filter
        ? printEntries.filter(([id, p]) =>
            id.toLowerCase().includes(filter.toLowerCase()) ||
            p.name.toLowerCase().includes(filter.toLowerCase()))
        : printEntries;

    const getPrintOverride = (printId: string) => data.prints?.[printId];
    const isPrintModified = (printId: string) => !!getPrintOverride(printId);

    const setPrintField = (printId: string, field: string, value: unknown) => {
        setData(d => {
            const existing = d.prints?.[printId] ?? {};
            const newPrints = {
                ...d.prints,
                [printId]: { ...existing, [field]: value },
            };
            return { ...d, prints: newPrints };
        });
    };

    const clearPrintOverride = (printId: string) => {
        setData(d => {
            if (!d.prints) return d;
            const newPrints = { ...d.prints };
            delete newPrints[printId];
            return { ...d, prints: newPrints };
        });
    };

    return <div className={styles.editor}>
        {/* 头部：名称 + 操作 */}
        <Box className={styles.header}>
            <Select
                className={styles.nameInput}
                options={[]}
                editable
                placeholder={t('rulesets.namePlaceholder', { defaultValue: 'Ruleset name' })}
                content={name}
                onEdit={setName}
            />
            <div className={styles.actions}>
                <Button disabled={updateRuleset.isPending || !name.trim()} onClick={onSave}>
                    <Text size={12}>{t('rulesets.save', { defaultValue: 'Save' })}</Text>
                </Button>
                <Button disabled={deleteRuleset.isPending} onClick={onDelete}>
                    <Text size={12}>{t('rulesets.delete', { defaultValue: 'Delete' })}</Text>
                </Button>
                {saveMsg && (
                    <Text size={12} className={saveMsg.ok ? styles.success : styles.error}>
                        {saveMsg.text}
                    </Text>
                )}
            </div>
        </Box>

        {/* FightOptions 编辑区 */}
        <Box className={styles.section}>
            <Text size={14}>{t('rulesets.fightOptions', { defaultValue: 'Fight Options' })}</Text>
            {numFields.map(({ key, label, min, max }) => (
                <div key={key} className={`${styles.optionRow} ${isOptModified(key) ? styles.printOverride : ''}`}>
                    <Text size={12} className={styles.optionLabel}>{label}</Text>
                    <div className={styles.optionValue}>
                        <input
                            type="number"
                            className={styles.numInput}
                            min={min}
                            max={max}
                            value={currentOpts[key] as number}
                            onChange={e => setOpt(key, Number(e.target.value) as FightOptions[typeof key])}
                        />
                        {isOptModified(key) && (
                            <Button onClick={() => setOpt(key, baseOpts[key])}>
                                <Text size={10}>reset</Text>
                            </Button>
                        )}
                    </div>
                </div>
            ))}
            {boolFields.map(({ key, label }) => {
                const val = currentOpts[key] as boolean;
                return (
                    <div key={key} className={`${styles.optionRow} ${isOptModified(key) ? styles.printOverride : ''}`}>
                        <Text size={12} className={styles.optionLabel}>{label}</Text>
                        <div className={styles.optionValue}>
                            <div
                                className={`${styles.toggle} ${val ? styles.on : styles.off}`}
                                onClick={() => setOpt(key, !val as FightOptions[typeof key])}
                            >
                                <Text size={12}>{val ? 'ON' : 'OFF'}</Text>
                            </div>
                            {isOptModified(key) && (
                                <Button onClick={() => setOpt(key, baseOpts[key])}>
                                    <Text size={10}>reset</Text>
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}
            {/* snuffCard 文本字段 */}
            <div className={`${styles.optionRow} ${isOptModified('snuffCard') ? styles.printOverride : ''}`}>
                <Text size={12} className={styles.optionLabel}>Snuff Card (printId)</Text>
                <div className={styles.optionValue}>
                    <input
                        type="text"
                        className={styles.numInput}
                        value={currentOpts.snuffCard}
                        onChange={e => setOpt('snuffCard', e.target.value)}
                    />
                    {isOptModified('snuffCard') && (
                        <Button onClick={() => setOpt('snuffCard', baseOpts.snuffCard)}>
                            <Text size={10}>reset</Text>
                        </Button>
                    )}
                </div>
            </div>
        </Box>

        {/* 卡牌覆盖编辑区 */}
        <Box className={styles.section}>
            <div className={styles.sectionHeader}>
                <Text size={14}>{t('rulesets.cardOverrides', { defaultValue: 'Card Overrides' })}</Text>
                <Text size={12}>{filteredPrints.length} / {printEntries.length}</Text>
            </div>
            <div className={styles.filterRow}>
                <Select
                    className={styles.filterInput}
                    options={[]}
                    editable
                    placeholder={t('rulesets.filterPlaceholder', { defaultValue: 'Filter by name or id...' })}
                    content={filter}
                    onEdit={setFilter}
                />
            </div>
            <div className={styles.printList}>
                {filteredPrints.slice(0, 100).map(([printId, print]) => {
                    const override = getPrintOverride(printId);
                    const modified = isPrintModified(printId);
                    const powerVal = override?.power ?? print.power;
                    const healthVal = override?.health ?? print.health;
                    const bannedVal = override?.banned ?? print.banned ?? false;
                    const sigilsVal = (override?.sigils ?? print.sigils ?? []).join(', ');
                    return (
                        <div key={printId} className={`${styles.printRow} ${modified ? styles.printOverride + ' ' + styles.modified : ''}`}>
                            <Text size={12} className={styles.printName}>{print.name} ({printId})</Text>
                            <div className={styles.printFields}>
                                <div className={styles.printField}>
                                    <Text size={10}>PWR</Text>
                                    <input
                                        type="text"
                                        className={styles.fieldInput}
                                        value={String(powerVal)}
                                        onChange={e => {
                                            const v = e.target.value;
                                            const num = Number(v);
                                            setPrintField(printId, 'power', isNaN(num) ? v : num);
                                        }}
                                    />
                                </div>
                                <div className={styles.printField}>
                                    <Text size={10}>HP</Text>
                                    <input
                                        type="number"
                                        className={styles.fieldInput}
                                        value={healthVal}
                                        onChange={e => setPrintField(printId, 'health', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.printField}>
                                    <Text size={10}>BANNED</Text>
                                    <div
                                        className={`${styles.toggle} ${bannedVal ? styles.on : styles.off}`}
                                        onClick={() => setPrintField(printId, 'banned', !bannedVal)}
                                    >
                                        <Text size={10}>{bannedVal ? 'Y' : 'N'}</Text>
                                    </div>
                                </div>
                                <div className={styles.printField}>
                                    <Text size={10}>SIGILS</Text>
                                    <input
                                        type="text"
                                        className={styles.sigilInput}
                                        placeholder="comma-separated sigil ids"
                                        value={sigilsVal}
                                        onChange={e => {
                                            const sigils = e.target.value
                                                .split(',')
                                                .map(s => s.trim())
                                                .filter(Boolean);
                                            setPrintField(printId, 'sigils', sigils);
                                        }}
                                    />
                                </div>
                                {modified && (
                                    <Button onClick={() => clearPrintOverride(printId)}>
                                        <Text size={10}>reset</Text>
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {filteredPrints.length > 100 && (
                    <Text size={12} className={styles.empty}>
                        {t('rulesets.tooMany', { defaultValue: 'Showing first 100. Use filter to narrow down.' })}
                    </Text>
                )}
            </div>
        </Box>
    </div>;
}

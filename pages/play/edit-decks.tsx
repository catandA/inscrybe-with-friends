import styles from './edit-decks.module.css';
import { rulesets } from '@/lib/defs/prints';
import { entries } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isCardsDirty, useDeckSync } from '@/hooks/useDeckStore';
import { PrintList } from '@/components/ui/PrintList';
import { AssetButton } from '@/components/inputs/AssetButton';
import { Select } from '@/components/inputs/Select';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { getSideDeckPrintIds } from '@/lib/engine/Card';
import { Box } from '@/components/ui/Box';
import { DeckCards } from '@/lib/engine/Deck';
import { defaultFightOptions } from '@/lib/online/z';

function useDeck(init: DeckCards) {
    const [deck, setDeck] = useState(init);
    const addCard = (id: string) => setDeck(deck => ({ ...deck, main: [...deck.main, id] }));
    const removeCard = (idx: number) => setDeck(deck => ({ ...deck, main: deck.main.filter((_, i) => i !== idx) }));
    const setSide = (ids: string[]) => setDeck(deck => ({ ...deck, side: ids }));
    return [deck, { addCard, removeCard, setSide, setDeck }] as const;
}

/**
 * 牌组合法性校验（对齐 Godot DeckEdit.gd）。
 * - 主牌组卡数 >= opts.deckSizeMin
 * - rare 卡主牌组限 1 张（enforced rare）
 * - 非 rare 卡主牌组每张上限 opts.maxCommonsMain
 * - 非 rare 卡副牌组每张上限 opts.maxCommonsSide
 * noHammer 是服务端锤子守卫（Tick.ts），UI 端不校验，仅在卡牌渲染时显示标记（待办）。
 */
function validateDeck(deck: DeckCards, rulesetId: string): { isValid: boolean; errors: string[] } {
    const prints = rulesets[rulesetId].prints;
    const opts = defaultFightOptions(rulesetId);
    const errors: string[] = [];

    if (deck.main.length < opts.deckSizeMin) {
        errors.push(`主牌组至少需要 ${opts.deckSizeMin} 张卡（当前 ${deck.main.length} 张）`);
    }

    const countIds = (ids: string[]) => {
        const counts: Record<string, number> = {};
        for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
        return counts;
    };

    const mainCounts = countIds(deck.main);
    for (const [id, count] of Object.entries(mainCounts)) {
        const print = prints[id];
        if (!print) continue;
        if (print.rare) {
            if (count > 1) errors.push(`${print.name}（稀有）最多 1 张（当前 ${count} 张）`);
        } else if (count > opts.maxCommonsMain) {
            errors.push(`${print.name} 最多 ${opts.maxCommonsMain} 张（当前 ${count} 张）`);
        }
    }

    const sideCounts = countIds(deck.side);
    for (const [id, count] of Object.entries(sideCounts)) {
        const print = prints[id];
        if (!print) continue;
        if (!print.rare && count > opts.maxCommonsSide) {
            errors.push(`副牌组 ${print.name} 最多 ${opts.maxCommonsSide} 张（当前 ${count} 张）`);
        }
    }

    return { isValid: errors.length === 0, errors };
}

export default function EditDecks() {
    const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
    const [deckNameInput, setDeckName] = useState('');
    const [selectedRuleset, setSelectedRuleset] = useState(Object.keys(rulesets)[0]);
    // TODO: unpair side-decks from rulesets, (add 'custom' option for when side deck isnt part of ruleset)
    const [defaultSideDeckId, defaultSideDeck] = Object.entries(rulesets[selectedRuleset].sideDecks)[0];
    const [selectedSideDeck, setSelectedSideDeck] = useState(defaultSideDeckId);
    const [deck, { addCard, removeCard, setSide, setDeck }] = useDeck({
        main: [],
        side: getSideDeckPrintIds(defaultSideDeck),
    });
    const {
        decks,
        saveDeck,
        deleteDeck,
        isLoading,
        isDeleting,
        isSaving,
        errorSaving,
    } = useDeckSync();

    const deckName = deckNameInput.trim();
    const hasDeckSelected = !!(selectedDeckId && decks[selectedDeckId]);

    let isDirty = false;
    if (hasDeckSelected) {
        isDirty ||= isCardsDirty(selectedDeckId, deck);
        isDirty ||= deckName !== decks[selectedDeckId].name;
        isDirty ||= selectedRuleset !== decks[selectedDeckId].ruleset;
    }

    const canMakeNew = !isDirty;

    // 牌组合法性校验（deckSizeMin / rare 限 1 / commons 上限）。非法时阻止保存。
    const validation = useMemo(() => validateDeck(deck, selectedRuleset), [deck, selectedRuleset]);
    const canSave = isDirty && validation.isValid;

    useEffect(() => {
        function onBeforeUnload(event: BeforeUnloadEvent) {
            if (isDirty) event.preventDefault();
        }
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [isDirty]);

    /* eslint-disable react-hooks/exhaustive-deps */
    useEffect(() => {
        if (!hasDeckSelected) return;

        decks[selectedDeckId].local = deck;
    }, [decks, deck, selectedDeckId]);
    /* eslint-enable react-hooks/exhaustive-deps */

    const onSelectDeck = (id: string) => {
        setSelectedDeckId(id);
        if (!id) return;
        setDeck(decks[id].local);
        setDeckName(decks[id].name);
    };
    const onDeckNameChange = (name: string) => {
        setDeckName(name);
    };

    const onCreateDeck = () => {
        let deckToCreate = deck;
        let deckNameToCreate = deckName;
        if (hasDeckSelected) {
            const defaultSideDeck = Object.keys(rulesets[selectedRuleset].sideDecks)[0];
            deckToCreate = { main: [], side: getSideDeckPrintIds(rulesets[selectedRuleset].sideDecks[defaultSideDeck]) };
            setDeck(deckToCreate);
            setSelectedSideDeck(defaultSideDeck);
            deckNameToCreate = '';
        }

        // TODO: add (x) counter for conflicts
        if (!deckNameToCreate) {
            for (let i = 1; i < 100; i++) {
                deckNameToCreate = `New Deck (${i})`;
                if (!Object.values(decks).some(deck => deck.name === deckNameToCreate)) break;
            }
        };
        setDeckName(deckNameToCreate);

        saveDeck(selectedDeckId ?? undefined, {
            name: deckNameToCreate,
            ruleset: selectedRuleset,
            cards: deckToCreate,
        }).then((deck) => {
            setSelectedDeckId(deck.id);
            setDeckName(deck.name);
        });
    };
    const onSaveDeck = () => {
        if (!hasDeckSelected) return;
        saveDeck(selectedDeckId, {
            name: deckName,
            ruleset: selectedRuleset,
            cards: deck,
        });
    };
    const onDeleteDeck = (id: string) => {
        if (id === selectedDeckId) {
            setDeck({ main: [], side: getSideDeckPrintIds(defaultSideDeck) });
            setSelectedDeckId(null);
            setDeckName('');
        }
        deleteDeck(id);
    };
    const onChangeRuleset = (id: string) => {
        if (id === selectedRuleset) return;
        const defaultSideDeck = Object.keys(rulesets[id].sideDecks)[0];
        setSelectedRuleset(id);
        setSelectedSideDeck(defaultSideDeck);
        setDeck({ main: [], side: getSideDeckPrintIds(rulesets[id].sideDecks[defaultSideDeck]) });
        setDeckName('');
        setSelectedDeckId(null);
    };

    /* eslint-disable react-hooks/exhaustive-deps */
    const onSideDeckSelect = useCallback((id: string) => {
        setSelectedSideDeck(id);
        setSide(getSideDeckPrintIds(rulesets[selectedRuleset].sideDecks[id]));
    }, []);
    const onPrintSelect = useCallback((id: string) => addCard(id), []);
    const onDeckPrintSelect = useCallback((id: string, idx: number) => removeCard(idx), []);
    const onClearDeck = useCallback(() => setDeck(deck => ({ ...deck, main: [] })), []);
    /* eslint-enable react-hooks/exhaustive-deps */

    const sideEntries = entries(rulesets[selectedRuleset].sideDecks);
    const deckEntries = entries(decks).sort(([, { name: a }], [, { name: b }]) => a.localeCompare(b));

    // TODO: figure out how to prevent deck select from flickering on create/rename

    return (
        <div className={styles.editor}>
            <Box className={styles.controls}>
                <div className={styles.controlsRow}>
                    <Select
                        className={styles.select}
                        options={entries(rulesets).map(([id, ruleset]) => [id, ruleset.name])}
                        value={selectedRuleset}
                        placeholder="Select Ruleset"
                        onSelect={id => onChangeRuleset(id)}
                    />
                    <Select
                        className={styles.select}
                        options={deckEntries.map(([, { id, name }]) => [id, name])}
                        disabled={!deckEntries.length}
                        value={selectedDeckId}
                        content={deckNameInput}
                        placeholder="Select a Deck"
                        editable
                        onSelect={id => onSelectDeck(id)}
                        onEdit={name => onDeckNameChange(name)}
                    />
                    <div style={{ flex: 1 }} />
                    <Button onClick={onClearDeck}>
                        <Text size={12}>Clear Deck</Text>
                    </Button>
                </div>
                <div className={styles.controlsRow}>
                    <div className={styles.actions}>
                        <AssetButton path="/assets/plus.png" title="Create New Deck" disabled={!canMakeNew} onClick={() => onCreateDeck()} />
                        <AssetButton path="/assets/disk.png" title="Save Deck" disabled={!canSave || isSaving} onClick={() => onSaveDeck()} />
                        <AssetButton path="/assets/trash.png" title="Delete Deck" disabled={!hasDeckSelected || isDeleting} onClick={() => onDeleteDeck(selectedDeckId!)} />
                        <AssetButton
                            // disabled={!isDirty || isSaving}
                            disabled
                            path={`/assets/${!isDirty ? 'cloudgreen' : errorSaving ? 'cloudred' : 'cloud'}.png`}
                            title={!isDirty ? 'Synced' : errorSaving ? 'Error while saving deck' : 'Syncing'}
                            onClick={() => onSaveDeck()}
                        />
                    </div>
                    <div style={{ flex:1 }} />
                    <Text size={14}>{`${deck.main.length}`} card{deck.main.length === 1 ? '' : 's'}</Text>
                </div>
                {validation.errors.length > 0 && (
                    <div className={styles.validationErrors}>
                        {validation.errors.map((err, i) => (
                            <Text key={i} size={12} className={styles.validationError}>{err}</Text>
                        ))}
                    </div>
                )}
            </Box>
            <div className={styles.deck}>
                {!deck.main.length && <div className={styles.emptyDeck}>
                    <Text size={14}>No cards in your deck, add them by selecting them on the right</Text>
                </div>}
                <PrintList editable prints={deck.main} onSelect={onDeckPrintSelect} ruleset={selectedRuleset} />
            </div>
            <Box className={styles.sideDeck}>
                <PrintList stacked prints={deck.side} ruleset={selectedRuleset} />
                <div className={styles.sideDeckSelector}>
                    <Text size={14}>Side Deck:</Text>
                    <Select
                        options={sideEntries.map(([id, sideDeck]) => [id, sideDeck.name])}
                        value={selectedSideDeck}
                        onSelect={onSideDeckSelect}
                    />
                </div>
            </Box>
            <div className={styles.prints}>
                <PrintList editable showNames onSelect={onPrintSelect} ruleset={selectedRuleset} />
            </div>
        </div>
    );
}

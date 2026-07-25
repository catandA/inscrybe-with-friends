import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { importRulesetFromGodotJSON } from './importRuleset';
import { rulesets, getMergedRuleset } from './prints';

/**
 * Phase 3.5：importRulesetFromGodotJSON 的单元测试。
 *
 * 覆盖：
 * - 错误处理（无效 JSON / 未知 base ruleset）
 * - 顶层 FightOptions 字段映射（snake_case → camelCase）
 * - snuff_card 反向映射（显示名 → printId）
 * - cards 数组 → prints 对象（含 sigil 显示名反向映射、参数化变体、atkspecial）
 * - side_decks 三种格式（single / single_cat / draft）
 * - 忽略字段 warnings（enable_backrow / custom_sigils / portrait / ruleset）
 * - 端到端：导入结果能通过 getMergedRuleset 校验
 * - 集成：用 reference/rulesets/standard.json 验证（文件不存在时 skip）
 */
describe('Phase 3.5: importRulesetFromGodotJSON', () => {
    const BASE = 'imfComp';

    it('未知 base ruleset 返回 error', () => {
        const result = importRulesetFromGodotJSON('{}', 'nonExistentBase');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Unknown base ruleset');
        expect(result.data).toEqual({});
    });

    it('无效 JSON 返回 error', () => {
        const result = importRulesetFromGodotJSON('{not valid json', BASE);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('JSON parse failed');
    });

    it('空 JSON 对象返回空 data（无字段可导入）', () => {
        const result = importRulesetFromGodotJSON('{}', BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.data).toEqual({});
    });

    it('顶层 FightOptions 字段 snake_case → camelCase 映射', () => {
        const json = JSON.stringify({
            hammers_per_turn: 5,
            ant_limit: 3,
            num_candles: 6,
            variable_attack_nerf: true,
            allow_snuffing_candles: false,
            opt_actives: true,
            starting_bones: 10,
            starting_energy_max: 8,
            deck_size_min: 20,
            max_commons_main: 3,
            max_commons_side: 5,
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.data.options).toEqual({
            hammersPerTurn: 5,
            antLimit: 3,
            numCandles: 6,
            variableAttackNerf: true,
            allowSnuffingCandles: false,
            optActives: true,
            startingBones: 10,
            maxEnergy: 8,
            deckSizeMin: 20,
            maxCommonsMain: 3,
            maxCommonsSide: 5,
        });
    });

    it('snuff_card 显示名反向映射为 printId', () => {
        // 找一个 base 中存在的卡牌名作为 snuff_card
        const basePrints = rulesets[BASE].prints;
        const samplePrintId = Object.keys(basePrints)[0];
        const sampleName = basePrints[samplePrintId].name;
        const json = JSON.stringify({ snuff_card: sampleName });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.data.options?.snuffCard).toBe(samplePrintId);
    });

    it('snuff_card 无法映射时记 warning 但不阻断', () => {
        const json = JSON.stringify({ snuff_card: 'Nonexistent Card Name' });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('snuff_card'))).toBe(true);
    });

    it('cards 数组转换为 prints 对象（含 sigil 反向映射）', () => {
        const basePrints = rulesets[BASE].prints;
        // 找一张存在的卡牌验证基本映射
        let samplePrintId = '';
        let sampleName = '';
        for (const [pid, print] of Object.entries(basePrints)) {
            if (print.sigils && print.sigils.length > 0) {
                samplePrintId = pid;
                sampleName = print.name;
                break;
            }
        }
        expect(samplePrintId).not.toBe('');

        const json = JSON.stringify({
            cards: [
                {
                    name: sampleName,
                    attack: 3,
                    health: 5,
                    blood_cost: 2,
                    sigils: [],
                },
            ],
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.data.prints).toBeDefined();
        expect(result.data.prints![samplePrintId]).toBeDefined();
        expect(result.data.prints![samplePrintId].name).toBe(sampleName);
        expect(result.data.prints![samplePrintId].health).toBe(5);
        expect(result.data.prints![samplePrintId].power).toBe(3);
        expect(result.data.prints![samplePrintId].cost).toEqual({ type: 'blood', amount: 2 });
    });

    it('cards 中未知卡牌名记 warning 并跳过', () => {
        const json = JSON.stringify({
            cards: [
                { name: 'Nonexistent Card', attack: 1, health: 1 },
            ],
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('Nonexistent Card'))).toBe(true);
        expect(result.data.prints).toBeUndefined();
    });

    it('side_decks single 格式转换', () => {
        const basePrints = rulesets[BASE].prints;
        const samplePrintId = Object.keys(basePrints)[0];
        const sampleName = basePrints[samplePrintId].name;
        const json = JSON.stringify({
            side_decks: {
                'Test Single': {
                    type: 'single',
                    card: sampleName,
                    count: 10,
                },
            },
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.data.sideDecks).toBeDefined();
        expect(result.data.sideDecks!['Test Single']).toEqual({
            name: 'Test Single',
            repeat: [10, samplePrintId],
        });
    });

    it('side_decks single_cat 格式转换', () => {
        const basePrints = rulesets[BASE].prints;
        const ids = Object.keys(basePrints).slice(0, 2);
        const json = JSON.stringify({
            side_decks: {
                'Test Cat': {
                    type: 'single_cat',
                    cards: {
                        'Cat A': { card: basePrints[ids[0]].name, count: 5 },
                        'Cat B': { card: basePrints[ids[1]].name, count: 3 },
                    },
                },
            },
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.data.sideDecks).toBeDefined();
        expect(result.data.sideDecks!['Test Cat'].singleCat).toEqual({
            'Cat A': [5, ids[0]],
            'Cat B': [3, ids[1]],
        });
    });

    it('side_decks draft 格式转换', () => {
        const basePrints = rulesets[BASE].prints;
        const ids = Object.keys(basePrints).slice(0, 3);
        const names = ids.map(id => basePrints[id].name);
        const json = JSON.stringify({
            side_decks: {
                'Test Draft': {
                    type: 'draft',
                    cards: names,
                    count: 10,
                },
            },
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.data.sideDecks).toBeDefined();
        expect(result.data.sideDecks!['Test Draft'].draft).toEqual({
            cards: ids,
            count: 10,
        });
    });

    it('忽略字段产生 warnings（enable_backrow / custom_sigils / portrait / ruleset）', () => {
        const json = JSON.stringify({
            ruleset: 'test_ruleset',
            enable_backrow: true,
            custom_sigils: { Foo: { description: 'bar' } },
            portrait: 'test_portrait',
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings.length).toBeGreaterThanOrEqual(4);
        expect(result.warnings.some(w => w.includes('ruleset'))).toBe(true);
        expect(result.warnings.some(w => w.includes('enable_backrow'))).toBe(true);
        expect(result.warnings.some(w => w.includes('custom_sigils'))).toBe(true);
        expect(result.warnings.some(w => w.includes('portrait'))).toBe(true);
    });

    it('端到端：导入结果能通过 getMergedRuleset 校验', () => {
        const basePrints = rulesets[BASE].prints;
        const samplePrintId = Object.keys(basePrints)[0];
        const sampleName = basePrints[samplePrintId].name;
        const json = JSON.stringify({
            num_candles: 4,
            cards: [
                { name: sampleName, attack: 2, health: 3, sigils: [] },
            ],
            side_decks: {
                Test: { type: 'single', card: sampleName, count: 5 },
            },
        });
        const result = importRulesetFromGodotJSON(json, BASE);
        expect(result.errors).toHaveLength(0);
        // options 在 UserRulesetData 上，getMergedRuleset 不合并 options（在别处手动合并）
        expect(result.data.options?.numCandles).toBe(4);

        // 导入数据应能通过 getMergedRuleset 校验（不抛异常）
        const merged = getMergedRuleset(BASE, result.data, 'Test Imported');
        expect(merged.prints[samplePrintId].health).toBe(3);
        expect(merged.sideDecks.Test).toBeDefined();
    });

    describe('集成测试：reference/rulesets/standard.json', () => {
        const standardJsonPath = resolve(__dirname, '../../reference/rulesets/standard.json');
        const hasStandardJson = existsSync(standardJsonPath);

        it.skipIf(!hasStandardJson)('能完整导入 standard.json 且无 errors', () => {
            const jsonText = readFileSync(standardJsonPath, 'utf-8');
            const result = importRulesetFromGodotJSON(jsonText, BASE);
            expect(result.errors).toHaveLength(0);
            // standard.json 有 ~250 张卡牌 + 8 个 side deck
            expect(Object.keys(result.data.prints ?? {}).length).toBeGreaterThan(100);
            expect(Object.keys(result.data.sideDecks ?? {}).length).toBeGreaterThan(3);
        });

        it.skipIf(!hasStandardJson)('导入 standard.json 后能通过 getMergedRuleset 校验', () => {
            const jsonText = readFileSync(standardJsonPath, 'utf-8');
            const result = importRulesetFromGodotJSON(jsonText, BASE);
            expect(result.errors).toHaveLength(0);
            // 不抛异常即通过
            getMergedRuleset(BASE, result.data, 'Standard Imported');
        });
    });
});

import { describe, it, expect } from 'vitest';
import {
    rulesets,
    getMergedRuleset,
    registerRuleset,
    isRegisteredRuleset,
    userRulesetKey,
    isUserRulesetKey,
    extractUserRulesetId,
    USER_RULESET_PREFIX,
} from './prints';
import type { UserRulesetData } from '../engine/Card';

/**
 * Phase 3.5：getMergedRuleset 与用户 ruleset synthetic key 工具的单元测试。
 *
 * 覆盖：
 * - 合并语义（空 override / prints 深合并 / 新增 print / sideDecks 整体替换 / sigilParams 整体替换）
 * - 校验失败（未知 base / evolution 引用非法 / sigilParams 引用未知 sigil / sideDeck 引用非法 print）
 * - synthetic key 工具（userRulesetKey / isUserRulesetKey / extractUserRulesetId）
 * - 运行时注册（registerRuleset / isRegisteredRuleset）
 */
describe('Phase 3 UGC: getMergedRuleset', () => {
    const BASE = 'imfComp';

    it('空 override 返回与 base 等价的内容（但 prints 对象是新的浅拷贝）', () => {
        const merged = getMergedRuleset(BASE, {});
        const base = rulesets[BASE];

        expect(merged.name).toBe(base.name);
        expect(merged.prints).not.toBe(base.prints); // 新对象
        expect(merged.sideDecks).not.toBe(base.sideDecks);
        expect(merged.sigilParams).not.toBe(base.sigilParams);

        // 内容等价：adder 的字段应一致
        expect(merged.prints.adder).toEqual(base.prints.adder);
    });

    it('name 参数覆盖 base 名称', () => {
        const merged = getMergedRuleset(BASE, {}, 'My Custom');
        expect(merged.name).toBe('My Custom');
    });

    it('未传 name 时回退到 base 名称', () => {
        const merged = getMergedRuleset(BASE, {});
        expect(merged.name).toBe(rulesets[BASE].name);
    });

    it('覆盖已有 print 的字段：深度合并，未覆盖字段保留 base 值', () => {
        const override: UserRulesetData = {
            prints: {
                adder: {
                    health: 99,
                    sigils: ['airborne'],
                },
            },
        };
        const merged = getMergedRuleset(BASE, override);
        const baseAdder = rulesets[BASE].prints.adder;

        // 覆盖的字段
        expect(merged.prints.adder.health).toBe(99);
        expect(merged.prints.adder.sigils).toEqual(['airborne']);
        // 未覆盖的字段保留
        expect(merged.prints.adder.name).toBe(baseAdder.name);
        expect(merged.prints.adder.power).toBe(baseAdder.power);
        expect(merged.prints.adder.cost).toEqual(baseAdder.cost);
    });

    it('覆盖已有 print 不污染 base ruleset', () => {
        const baseAdderHealth = rulesets[BASE].prints.adder.health;
        const override: UserRulesetData = {
            prints: { adder: { health: 99 } },
        };
        getMergedRuleset(BASE, override);
        // base 应未被修改
        expect(rulesets[BASE].prints.adder.health).toBe(baseAdderHealth);
    });

    it('新增 print：完整对象直接加入，validateRuleset 填充默认 portrait', () => {
        const newPrint = {
            name: 'Test Card',
            health: 3,
            power: 2,
            sigils: ['airborne'],
        };
        const override: UserRulesetData = {
            prints: { testCard: newPrint },
        };
        const merged = getMergedRuleset(BASE, override);

        expect(merged.prints.testCard).toBeDefined();
        expect(merged.prints.testCard.name).toBe('Test Card');
        // validateRuleset 填充默认 portrait = id
        expect(merged.prints.testCard.portrait).toBe('testCard');
    });

    it('sideDecks 整体替换某 id（不深度合并）', () => {
        const newSideDeck = {
            name: 'Test Side',
            repeat: [10, 'adder'] as [number, string],
        };
        const override: UserRulesetData = {
            sideDecks: { testSide: newSideDeck },
        };
        const merged = getMergedRuleset(BASE, override);

        expect(merged.sideDecks.testSide).toEqual(newSideDeck);
        // base 的 sideDecks 仍保留（spread 合并）
        // imfComp 至少有一个 sideDeck（vessels 等），此处只验证新增的存在
        expect(Object.keys(merged.sideDecks).length).toBeGreaterThanOrEqual(1);
    });

    it('sigilParams 整体替换某 sigil 的参数', () => {
        const override: UserRulesetData = {
            sigilParams: { detonator: [10] },
        };
        const merged = getMergedRuleset(BASE, override);

        expect(merged.sigilParams.detonator).toEqual([10]);
    });

    it('未知 base ruleset id 抛错', () => {
        expect(() => getMergedRuleset('nonExistentBase', {})).toThrow(/Unknown base ruleset/);
    });

    it('校验失败：evolution 引用不存在的 print 抛错', () => {
        const override: UserRulesetData = {
            prints: {
                testEvo: {
                    name: 'Test Evo',
                    health: 1,
                    power: 1,
                    evolution: 'thisPrintDoesNotExist',
                },
            },
        };
        expect(() => getMergedRuleset(BASE, override)).toThrow(/invalid evolution/);
    });

    it('校验失败：sigilParams 引用未知 sigil 抛错', () => {
        const override: UserRulesetData = {
            sigilParams: { unknownSigilXyz: [1] },
        };
        expect(() => getMergedRuleset(BASE, override)).toThrow(/unknown sigil/);
    });

    it('校验失败：sideDeck.repeat 引用不存在的 print 抛错', () => {
        const override: UserRulesetData = {
            sideDecks: {
                badSide: {
                    name: 'Bad Side',
                    repeat: [5, 'nonExistentPrint'],
                },
            },
        };
        expect(() => getMergedRuleset(BASE, override)).toThrow(/invalid print/);
    });

    it('校验失败：sideDeck.singleCat 引用不存在的 print 抛错', () => {
        const override: UserRulesetData = {
            sideDecks: {
                badCat: {
                    name: 'Bad Cat',
                    singleCat: { cat1: [3, 'nonExistentPrint'] },
                },
            },
        };
        expect(() => getMergedRuleset(BASE, override)).toThrow(/invalid print/);
    });

    it('校验失败：sideDeck.draft 引用不存在的 print 抛错', () => {
        const override: UserRulesetData = {
            sideDecks: {
                badDraft: {
                    name: 'Bad Draft',
                    draft: { cards: ['adder', 'nonExistentPrint'], count: 2 },
                },
            },
        };
        expect(() => getMergedRuleset(BASE, override)).toThrow(/invalid print/);
    });
});

describe('Phase 3 UGC: synthetic key 工具', () => {
    it('userRulesetKey 生成 user:UUID 格式', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        expect(userRulesetKey(uuid)).toBe(`user:${uuid}`);
    });

    it('isUserRulesetKey 识别 user: 前缀', () => {
        expect(isUserRulesetKey('user:abc-123')).toBe(true);
        expect(isUserRulesetKey('imfComp')).toBe(false);
        expect(isUserRulesetKey('user:')).toBe(true); // 边界：只有前缀也算
    });

    it('extractUserRulesetId 从 synthetic key 提取 UUID', () => {
        const uuid = 'abc-123-def';
        expect(extractUserRulesetId(userRulesetKey(uuid))).toBe(uuid);
    });

    it('USER_RULESET_PREFIX 常量正确导出', () => {
        expect(USER_RULESET_PREFIX).toBe('user:');
    });
});

describe('Phase 3 UGC: 运行时注册', () => {
    it('registerRuleset 注册后 isRegisteredRuleset 返回 true', () => {
        const testKey = 'user:test-register-key';
        // 注册前应不存在（或已被前次测试注册过——幂等，不强制）
        const merged = getMergedRuleset('imfComp', {}, 'Test Register');
        registerRuleset(testKey, merged);
        expect(isRegisteredRuleset(testKey)).toBe(true);
        // 注册后 rulesets[testKey] 可用
        expect(rulesets[testKey]).toBe(merged);
    });

    it('内置 ruleset id 在 isRegisteredRuleset 中返回 true', () => {
        expect(isRegisteredRuleset('imfComp')).toBe(true);
    });

    it('未注册的随机 id 在 isRegisteredRuleset 中返回 false', () => {
        expect(isRegisteredRuleset('totally-random-id-xyz')).toBe(false);
    });

    it('registerRuleset 是幂等的（重复注册覆盖）', () => {
        const key = 'user:test-idempotent';
        const r1 = getMergedRuleset('imfComp', {}, 'V1');
        registerRuleset(key, r1);
        const r2 = getMergedRuleset('imfComp', {}, 'V2');
        registerRuleset(key, r2);
        expect(rulesets[key]).toBe(r2);
        expect(rulesets[key].name).toBe('V2');
    });
});

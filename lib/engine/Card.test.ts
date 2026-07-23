import { describe, it, expect } from 'vitest';
import { getSideDeckPrintIds, getCardPower, getMoxes, getCircuit, CardPrint, Card } from './Card';
import { MoxType } from './constants';
import { makeMinimalFight, placeCard, PRINTS } from './__testutils__/fight';

describe('getSideDeckPrintIds', () => {
    it('repeat: [3, "squirrel"] 展开为 3 张 squirrel', () => {
        expect(getSideDeckPrintIds({ name: 'x', repeat: [3, 'squirrel'] })).toEqual([
            'squirrel', 'squirrel', 'squirrel',
        ]);
    });

    it('无 repeat 字段返回空数组', () => {
        expect(getSideDeckPrintIds({ name: 'x' })).toEqual([]);
    });
});

describe('getCardPower', () => {
    it('数字 power 卡返回其 power（adder=2）', () => {
        const fight = makeMinimalFight();
        placeCard(fight, 'player', 0, 'adder');
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBe(2);
    });

    it('"ants" power：场上 3 张 ant tribe 卡 → Math.min(2, 3) = 2', () => {
        // 锁住 Card.ts:118 的 Math.min(2, antCount) 硬编码。
        // Phase 1 修复 ant_limit（读 fight.opts.antLimit）后此测试需更新。
        const fight = makeMinimalFight();
        placeCard(fight, 'player', 0, 'workerAnt');
        placeCard(fight, 'player', 1, 'workerAnt');
        placeCard(fight, 'player', 2, 'workerAnt');
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBe(2);
    });

    it('"moxes" power：仅统计 Green gem（当前 bug，Phase 1 修复为统计全部 Mox）', () => {
        // Card.ts:134 当前：getMoxes([card]) & MoxType.Green —— 只算 Green。
        // 场上 greenMage(power='moxes') + moxG(Green) + moxO(Orange, 无 Green) → 计数 1。
        // Godot 原版应统计所有 Mox → 应为 2。Phase 1 修 moxes bug 后此测试改为 2。
        const fight = makeMinimalFight();
        placeCard(fight, 'player', 0, 'greenMage');
        placeCard(fight, 'player', 1, 'moxG');
        placeCard(fight, 'player', 2, 'moxO');
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBe(1);
    });

    it('空格返回 null', () => {
        const fight = makeMinimalFight();
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBeNull();
    });
});

describe('getMoxes', () => {
    it('gainGemAll 卡贡献三色（Green|Orange|Blue）', () => {
        const card: Card = {
            print: 'greatMox',
            state: { power: 0, health: 1, sigils: ['gainGemAll'], flipped: false },
        };
        expect(getMoxes([card])).toBe(MoxType.Green | MoxType.Orange | MoxType.Blue);
    });

    it('Green + Orange 两张卡合并位标志', () => {
        const green: Card = {
            print: 'moxG', state: { power: 0, health: 1, sigils: ['gainGemGreen'], flipped: false },
        };
        const orange: Card = {
            print: 'moxO', state: { power: 0, health: 1, sigils: ['gainGemOrange'], flipped: false },
        };
        expect(getMoxes([green, orange])).toBe(MoxType.Green | MoxType.Orange);
    });
});

describe('getCircuit', () => {
    it('两端 conduit、中间空 → [left, circuit, right, null]', () => {
        // 用受控假 prints，避免依赖具体 conduit 卡定义。
        const fakePrints = { c: { conduit: true, name: 'c', power: 0, health: 1 } } as unknown as Record<string, Readonly<CardPrint>>;
        const field: (Card | null)[] = [
            { print: 'c', state: { power: 0, health: 1, sigils: [], flipped: false } },
            null,
            { print: 'c', state: { power: 0, health: 1, sigils: [], flipped: false } },
            null,
        ];
        expect(getCircuit(fakePrints, field)).toEqual(['left', 'circuit', 'right', null]);
    });

    it('仅 1 个 conduit 时全部为 null（无法成环）', () => {
        const fakePrints = { c: { conduit: true, name: 'c', power: 0, health: 1 } } as unknown as Record<string, Readonly<CardPrint>>;
        const field: (Card | null)[] = [
            { print: 'c', state: { power: 0, health: 1, sigils: [], flipped: false } },
            null, null, null,
        ];
        expect(getCircuit(fakePrints, field)).toEqual([null, null, null, null]);
    });
});

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

    it('"ants" power：默认 antLimit=2 时 3 张 ant → 2', () => {
        // 验证默认 antLimit=2 与旧硬编码行为一致。
        const fight = makeMinimalFight();
        placeCard(fight, 'player', 0, 'workerAnt');
        placeCard(fight, 'player', 1, 'workerAnt');
        placeCard(fight, 'player', 2, 'workerAnt');
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBe(2);
    });

    it('"ants" power：自定义 antLimit 突破 2', () => {
        const fight = makeMinimalFight({ antLimit: 5 });
        placeCard(fight, 'player', 0, 'workerAnt');
        placeCard(fight, 'player', 1, 'workerAnt');
        placeCard(fight, 'player', 2, 'workerAnt');
        placeCard(fight, 'player', 3, 'workerAnt');
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBe(4);
    });

    it('"moxes" power：统计所有 Mox 卡（绿/橙/蓝都算）', () => {
        // 场上 greenMage(power='moxes') + moxG(Green) + moxO(Orange) → 计数 2。
        const fight = makeMinimalFight();
        placeCard(fight, 'player', 0, 'greenMage');
        placeCard(fight, 'player', 1, 'moxG');
        placeCard(fight, 'player', 2, 'moxO');
        expect(getCardPower(PRINTS, fight, ['player', 0])).toBe(2);
    });

    it('"moxes" power：gainGemAll 卡算 1 张 Mox 卡', () => {
        const fight = makeMinimalFight();
        placeCard(fight, 'player', 0, 'greenMage');
        placeCard(fight, 'player', 1, 'moxAll'); // Magnus Mox, sigils: ['gainGemAll']
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

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

    it('singleCat: 默认返回第一个分类的卡', () => {
        expect(getSideDeckPrintIds({
            name: 'x',
            singleCat: {
                '10 Empty': [10, 'emptyVessel'],
                '10 Leaping': [10, 'leapingVessel'],
            },
        })).toEqual(Array(10).fill('emptyVessel'));
    });

    it('singleCat: 只有一个分类时正常展开', () => {
        expect(getSideDeckPrintIds({
            name: 'x',
            singleCat: { '3 Sharp': [3, 'sharpVessel'] },
        })).toEqual(['sharpVessel', 'sharpVessel', 'sharpVessel']);
    });

    it('draft: 默认预填卡池前 count 张', () => {
        expect(getSideDeckPrintIds({
            name: 'x',
            draft: { cards: ['moxG', 'moxB', 'moxO'], count: 2 },
        })).toEqual(['moxG', 'moxB']);
    });

    it('draft: count 超过卡池长度时返回全部', () => {
        expect(getSideDeckPrintIds({
            name: 'x',
            draft: { cards: ['moxG', 'moxB'], count: 10 },
        })).toEqual(['moxG', 'moxB']);
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

describe('Annoying buff (incrOppPower)', () => {
    it('对面同 lane 卡 +1 攻', () => {
        const fight = makeMinimalFight();
        const annoying = placeCard(fight, 'player', 0, 'adder');
        annoying.state.sigils = ['annoying'];
        const target = placeCard(fight, 'opposing', 0, 'adder'); // power 2
        expect(getCardPower(PRINTS, fight, ['opposing', 0])).toBe(3); // 2 + 1
    });

    it('Made of Stone 免疫 Annoying', () => {
        const fight = makeMinimalFight();
        const annoying = placeCard(fight, 'player', 0, 'adder');
        annoying.state.sigils = ['annoying'];
        const target = placeCard(fight, 'opposing', 0, 'adder');
        target.state.sigils = ['stone']; // 覆盖 adder 的 deathTouch，只留 stone
        expect(getCardPower(PRINTS, fight, ['opposing', 0])).toBe(2); // 不受 annoying 影响
    });

    it('非对面位置不受影响', () => {
        const fight = makeMinimalFight();
        const annoying = placeCard(fight, 'player', 0, 'adder');
        annoying.state.sigils = ['annoying'];
        // lane 1 的卡不在对面（annoying 在 player lane 0）
        placeCard(fight, 'opposing', 1, 'adder');
        expect(getCardPower(PRINTS, fight, ['opposing', 1])).toBe(2); // 无 buff
    });
});

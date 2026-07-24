import { describe, it, expect } from 'vitest';
import { translateEvent, Event, eventSettlers } from './Events';
import { makeMinimalFight } from './__testutils__/fight';

describe('damage_stun (lifeLoss settler)', () => {
    it('lifeLoss settler 置位 damageStun + 重置 points', () => {
        const fight = makeMinimalFight();
        fight.points = { player: 5, opposing: 0 };
        expect(fight.damageStun).toBe(false);

        eventSettlers.lifeLoss(fight, { type: 'lifeLoss', side: 'opposing' });

        // 掉蜡烛后 damageStun 置位
        expect(fight.damageStun).toBe(true);
        // 双方 points 重置为 0
        expect(fight.points).toEqual({ player: 0, opposing: 0 });
        // opposing 掉 1 蜡烛
        expect(fight.players.opposing.deaths).toBe(1);
    });

    it('phase settler 在 pre-turn 时重置 damageStun', () => {
        const fight = makeMinimalFight();
        fight.damageStun = true;

        eventSettlers.phase(fight, { type: 'phase', phase: 'pre-turn', side: 'player' });

        expect(fight.damageStun).toBe(false);
    });

    it('phase settler 在非 pre-turn 阶段不重置 damageStun', () => {
        const fight = makeMinimalFight();
        fight.damageStun = true;

        eventSettlers.phase(fight, { type: 'phase', phase: 'attack' });

        expect(fight.damageStun).toBe(true);
    });
});

describe('translateEvent', () => {
    it('opposing 视角下对手的 draw：隐藏 card/source，side 翻转', () => {
        // 原始事件：player 抽了一张牌（对 opposing 视角是对手抽牌）
        const event: Event = {
            type: 'draw',
            side: 'player',
            card: { print: 'adder', state: { power: 2, health: 2, sigils: [], flipped: false } },
            source: 'main',
        };

        const result = translateEvent(event, 'opposing');
        expect(result).not.toBeNull();
        if (result?.type !== 'draw') throw new Error('expected draw event');
        // 机密字段被删除
        expect(result).not.toHaveProperty('card');
        expect(result).not.toHaveProperty('source');
        // side 翻转：player → opposing
        expect(result.side).toBe('opposing');
    });

    it('newSigil 落在对手手牌：返回 null（被过滤）', () => {
        const event: Event = {
            type: 'newSigil',
            pos: ['hand', ['player', 0]],
            sigil: 'brittle',
        };

        // opposing 视角下，player 的手牌 newSigil 不可见
        const result = translateEvent(event, 'opposing');
        expect(result).toBeNull();
    });

    it('player 视角下自己的 draw：保留 card/source，side 不翻', () => {
        const event: Event = {
            type: 'draw',
            side: 'player',
            card: { print: 'adder', state: { power: 2, health: 2, sigils: [], flipped: false } },
            source: 'main',
        };

        const result = translateEvent(event, 'player');
        expect(result).not.toBeNull();
        if (result?.type !== 'draw') throw new Error('expected draw event');
        expect(result).toHaveProperty('card');
        expect(result).toHaveProperty('source');
        expect(result.side).toBe('player');
    });
});

import { describe, it, expect } from 'vitest';
import { translateEvent, Event } from './Events';

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

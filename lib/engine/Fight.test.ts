import { describe, it, expect } from 'vitest';
import { translateFight } from './Fight';
import { makeMinimalFight } from './__testutils__/fight';

describe('createFight', () => {
    it('初始化后 field 双方各 lanes 个 null，energy 为 [0,0]', () => {
        const fight = makeMinimalFight({ lanes: 4 });
        expect(fight.field.player).toEqual([null, null, null, null]);
        expect(fight.field.opposing).toEqual([null, null, null, null]);
        expect(fight.players.player.energy).toEqual([0, 0]);
        expect(fight.players.opposing.energy).toEqual([0, 0]);
        expect(fight.turn).toEqual({ side: 'player', phase: 'pre-turn' });
        expect(fight.points).toEqual({ player: 0, opposing: 0 });
    });

    it('lanes=2 时 field 长度为 2', () => {
        const fight = makeMinimalFight({ lanes: 2 });
        expect(fight.field.player).toHaveLength(2);
    });
});

describe('translateFight', () => {
    it('player 视角：保留己方手牌，不暴露对手手牌', () => {
        const fight = makeMinimalFight();
        // 给双方各塞一张手牌（绕过 draw 事件）
        fight.hands.player.push({ print: 'adder', state: { power: 2, health: 2, sigils: [], flipped: false } });
        fight.hands.opposing.push({ print: 'adder', state: { power: 2, health: 2, sigils: [], flipped: false } });

        const view = translateFight(fight, 'player');
        expect(view.hands.player).toHaveLength(1);
        // Fight<'player'> 类型上 hands 只含 player 键，opposing 不应存在
        expect(view.hands).not.toHaveProperty('opposing');
        // mustPlay 同理只含己方
        expect(view.mustPlay).toHaveProperty('player');
        expect(view.mustPlay).not.toHaveProperty('opposing');
    });

    it('opposing 视角：turn.side 翻转、points 对调', () => {
        const fight = makeMinimalFight();
        fight.turn.side = 'player';
        fight.points = { player: 5, opposing: 3 };

        const view = translateFight(fight, 'opposing');
        // 原始 turn.side='player'，opposing 视角下应翻为 'opposing'
        expect(view.turn.side).toBe('opposing');
        // 原始 player=5/opposing=3，opposing 视角下玩家看到自己=3、对手=5
        expect(view.points).toEqual({ player: 3, opposing: 5 });
    });
});

import { describe, it, expect } from 'vitest';
import { Event } from '../engine/Events';
import { initCardFromPrint } from '../engine/Card';
import { PRINTS, placeCard } from '../engine/__testutils__/fight';
import { runEvents, firstEvent } from './__testutils__/runTick';

/**
 * 符文行为快照测试。
 *
 * 这些测试锁住「当前行为」（含已知的 bug），作为后续 Phase 1-2 重构的安全网：
 * - voidDamage：单目标取消 attack（与 Godot 一致，PORTING_PLAN §4.11）
 * - drawCopy：复制体去 sigil（当前=Kaycee 行为，§4.12）
 * - conduitGainEnergy：硬编码 total=3、未检查 circuit（§4.7 bug）
 * - antSpawner：抽 sigilParams 指定的卡
 * - bellist：相邻空格生成卡
 *
 * Phase 1-2 修复这些 bug 时，对应测试需同步更新（届时会在此处标注）。
 */
describe('符文行为快照', () => {

    describe('voidDamage (Repulsive)', () => {
        it('单目标 attack 被 cancel：不造成伤害、不入 settled', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    placeCard(fight, 'opposing', 0, 'starvation'); // sigils: ['voidDamage']
                    placeCard(fight, 'player', 0, 'adder');        // power 2 攻击方
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );

            // attack 被 voidDamage.cancel() 取消，不出现在 settled
            expect(packet.settled).toEqual([]);
            // 双方均未受伤
            expect(fight.field.player[0]?.state.health).toBe(2);
            expect(fight.field.opposing[0]?.state.health).toBe(1);
        });
    });

    describe('drawCopy (Fecundity, 当前=Kaycee 行为)', () => {
        it('打出后复制一张到手牌，复制体不带 drawCopy', async () => {
            const { fight, packet } = await runEvents(
                () => {},
                [{
                    type: 'play',
                    pos: ['player', 0],
                    card: initCardFromPrint(PRINTS, 'fieldMice'), // sigils: ['drawCopy']
                } as Event],
            );

            const types = packet.settled.map(e => e.type);
            expect(types).toContain('play');
            expect(types).toContain('draw');

            // 原卡上场
            expect(fight.field.player[0]?.print).toBe('fieldMice');
            // 复制体入手牌
            expect(fight.hands.player).toHaveLength(1);
            const copy = fight.hands.player[0];
            expect(copy.print).toBe('fieldMice');
            // 锁住当前 Kaycee 行为：复制体去掉了 drawCopy（sigils.ts:515）
            // Phase 2 拆分普通 Fecundity 时此断言需更新
            expect(copy.state.sigils).not.toContain('drawCopy');
        });
    });

    describe('conduitGainEnergy (Energy Conduit (+3), 当前有 bug)', () => {
        it('pre-turn 阶段触发 energy 事件，total 硬编码 3', async () => {
            const { packet } = await runEvents(
                (fight) => {
                    placeCard(fight, 'player', 0, 'conduitEnergy'); // conduit:true, sigils:['conduitGainEnergy']
                },
                [{ type: 'phase', phase: 'pre-turn', side: 'player' } as Event],
            );

            const types = packet.settled.map(e => e.type);
            expect(types).toContain('phase');
            expect(types).toContain('energy');

            const energyEvent = firstEvent(packet, 'energy');
            // 锁住当前 bug：total 硬编码 3（sigils.ts:1076），
            // 未读 sigilParams.conduitGainEnergy = [3]（prints.ts:1157），
            // 也未检查 circuit（sigils.ts:1072 的 TODO）。
            // Phase 2 修复时：total 应来自 sigilParams，且需 circuit 守卫。
            expect(energyEvent.total).toBe(3);
            expect(energyEvent.amount).toBe(0);
            expect(energyEvent.side).toBe('player');
        });

        it('非 pre-turn 阶段不触发（守卫 phase 检查）', async () => {
            const { packet } = await runEvents(
                (fight) => {
                    placeCard(fight, 'player', 0, 'conduitEnergy');
                },
                [{ type: 'phase', phase: 'play', side: 'player' } as Event],
            );
            // play 阶段不触发 conduitGainEnergy
            expect(packet.settled.map(e => e.type)).not.toContain('energy');
        });
    });

    describe('antSpawner', () => {
        it('打出后抽一张 workerAnt 到手牌（来自 sigilParams）', async () => {
            const { fight, packet } = await runEvents(
                () => {},
                [{
                    type: 'play',
                    pos: ['player', 0],
                    card: initCardFromPrint(PRINTS, 'queenAnt'), // sigils: ['antSpawner']
                } as Event],
            );

            const types = packet.settled.map(e => e.type);
            expect(types).toContain('play');
            expect(types).toContain('draw');

            // sigilParams.antSpawner = ['workerAnt']（prints.ts:1141）
            expect(fight.hands.player).toHaveLength(1);
            expect(fight.hands.player[0].print).toBe('workerAnt');
        });
    });

    describe('bellist', () => {
        it('打出后在相邻空格各生成一张 chime', async () => {
            const { fight, packet } = await runEvents(
                () => {},
                [{
                    type: 'play',
                    pos: ['player', 1], // 中间 lane
                    card: initCardFromPrint(PRINTS, 'theDaus'), // sigils: ['bellist']
                } as Event],
            );

            // 1 个原始 play + 2 个 chime play
            const plays = packet.settled.filter(e => e.type === 'play');
            expect(plays).toHaveLength(3);

            // sigilParams.bellist = ['chime']（prints.ts:1143）
            expect(fight.field.player[0]?.print).toBe('chime');
            expect(fight.field.player[1]?.print).toBe('theDaus');
            expect(fight.field.player[2]?.print).toBe('chime');
        });
    });
});

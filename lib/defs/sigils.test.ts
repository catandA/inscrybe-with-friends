import { describe, it, expect, afterEach } from 'vitest';
import { Event } from '../engine/Events';
import { initCardFromPrint } from '../engine/Card';
import { PRINTS, placeCard } from '../engine/__testutils__/fight';
import { runEvents, runAction, firstEvent } from './__testutils__/runTick';
import { ErrorType } from '../engine/Errors';

/**
 * 符文行为快照测试。
 *
 * 这些测试验证符文行为：
 * - voidDamage：单目标取消 attack（与 Godot 一致，PORTING_PLAN §4.11）
 * - drawCopy：复制体去 sigil（当前=Kaycee 行为，§4.12）
 * - conduitGainEnergy：circuit 完成时读 sigilParams 提升能量上限（§4.7 已修复）
 * - antSpawner：抽 sigilParams 指定的卡
 * - bellist：相邻空格生成卡
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

    describe('drawCopy (Fecundity, 普通=保留符文)', () => {
        it('打出后复制一张到手牌，复制体保留 drawCopy（可无限增殖）', async () => {
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
            // 普通 Fecundity：复制体保留 drawCopy（对齐 Godot Fecundity.gd）
            expect(copy.state.sigils).toContain('drawCopy');
        });
    });

    describe('drawCopyKaycee (Fecundity Kaycee, 一次性)', () => {
        it('打出后复制一张到手牌，复制体去掉 drawCopyKaycee', async () => {
            const { fight, packet } = await runEvents(
                () => {},
                [{
                    type: 'play',
                    pos: ['player', 0],
                    card: (() => {
                        // fieldMice 原本是 drawCopy；这里手动换成 drawCopyKaycee 测试 Kaycee 行为
                        const c = initCardFromPrint(PRINTS, 'fieldMice');
                        c.state.sigils = ['drawCopyKaycee'];
                        return c;
                    })(),
                } as Event],
            );

            const types = packet.settled.map(e => e.type);
            expect(types).toContain('play');
            expect(types).toContain('draw');

            // 原卡上场，仍带 drawCopyKaycee
            expect(fight.field.player[0]?.state.sigils).toContain('drawCopyKaycee');
            // 复制体入手牌
            expect(fight.hands.player).toHaveLength(1);
            const copy = fight.hands.player[0];
            // Kaycee 变体：复制体去掉 drawCopyKaycee（一次性）
            expect(copy.state.sigils).not.toContain('drawCopyKaycee');
        });
    });

    describe('conduitGainEnergy (Energy Conduit (+3))', () => {
        it('完整 circuit 时 pre-turn 提升 max energy，total 来自 sigilParams', async () => {
            const { packet } = await runEvents(
                (fight) => {
                    placeCard(fight, 'player', 0, 'conduitEnergy'); // conduit + conduitGainEnergy
                    placeCard(fight, 'player', 2, 'franknstein');   // conduit，完成 circuit
                },
                [{ type: 'phase', phase: 'pre-turn', side: 'player' } as Event],
            );

            const types = packet.settled.map(e => e.type);
            expect(types).toContain('phase');
            expect(types).toContain('energy');

            const energyEvent = firstEvent(packet, 'energy');
            expect(energyEvent.total).toBe(3);   // sigilParams.conduitGainEnergy = [3]
            expect(energyEvent.amount).toBe(0);
            expect(energyEvent.side).toBe('player');
        });

        it('单张 conduit 不成 circuit → 不触发 conduitGainEnergy 的 energy 事件', async () => {
            const { packet } = await runEvents(
                (fight) => {
                    placeCard(fight, 'player', 0, 'conduitEnergy');
                },
                [{ type: 'phase', phase: 'pre-turn', side: 'player' } as Event],
            );
            // pre-turn 阶段 defaultEffects 会发恢复能量的 energy 事件（无 total 字段），
            // 这里要排除的是来自 conduitGainEnergy 的 total=3 事件。
            const conduitEnergyEvents = packet.settled.filter(
                (e): e is Extract<Event, { type: 'energy' }> => e.type === 'energy' && e.total === 3,
            );
            expect(conduitEnergyEvents).toHaveLength(0);
        });

        it('非 pre-turn 阶段不触发（守卫 phase 检查）', async () => {
            const { packet } = await runEvents(
                (fight) => {
                    placeCard(fight, 'player', 0, 'conduitEnergy');
                    placeCard(fight, 'player', 2, 'franknstein');
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

    describe('armored (Armored)', () => {
        it('首次 attack 完全免疫：target health 不变，armoredUsed=true', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = ['armored'];
                    defender.state.health = 5;
                    const attacker = placeCard(fight, 'player', 0, 'adder');
                    attacker.state.sigils = [];
                    attacker.state.power = 3;
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );

            // attack 事件仍 settle（被 Armored 设 damage=0 + negated，不算无效）
            expect(packet.settled.some(e => e.type === 'attack')).toBe(true);
            // 防御方未受伤
            expect(fight.field.opposing[0]?.state.health).toBe(5);
            // armoredUsed 已置位
            expect(fight.field.opposing[0]?.state.armoredUsed).toBe(true);
        });

        it('第二次 attack 正常受伤（armoredUsed 已用）', async () => {
            const { fight } = await runEvents(
                (fight) => {
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = ['armored'];
                    defender.state.armoredUsed = true; // 已用掉
                    defender.state.health = 5;
                    const attacker = placeCard(fight, 'player', 0, 'adder');
                    attacker.state.sigils = [];
                    attacker.state.power = 3;
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );

            // 防御方受伤（5 - 3 = 2）
            expect(fight.field.opposing[0]?.state.health).toBe(2);
        });

        it('shoot（Detonator 类）也被 Armored 免疫', async () => {
            const { fight } = await runEvents(
                (fight) => {
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = ['armored'];
                    defender.state.health = 5;
                    placeCard(fight, 'player', 0, 'adder');
                },
                [{ type: 'shoot', from: ['player', 0], to: ['opposing', 0], damage: 5 } as Event],
            );

            expect(fight.field.opposing[0]?.state.health).toBe(5);
            expect(fight.field.opposing[0]?.state.armoredUsed).toBe(true);
        });
    });

    describe('warded (Warded, 修正 Godot bug)', () => {
        it('高伤害 attack 削为 1（修正 Godot max(dmg,1) bug）', async () => {
            const { fight } = await runEvents(
                (fight) => {
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = ['warded'];
                    defender.state.health = 10;
                    const attacker = placeCard(fight, 'player', 0, 'adder');
                    attacker.state.sigils = [];
                    attacker.state.power = 10;
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );
            // Godot 原 bug 是 max(10,1)=10（仍受 10 伤）；Web 修正为每次最多 1 伤
            expect(fight.field.opposing[0]?.state.health).toBe(9); // 10 - 1
        });

        it('shoot 也被 Warded 削为 1', async () => {
            const { fight } = await runEvents(
                (fight) => {
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = ['warded'];
                    defender.state.health = 10;
                    placeCard(fight, 'player', 0, 'adder');
                },
                [{ type: 'shoot', from: ['player', 0], to: ['opposing', 0], damage: 5 } as Event],
            );
            expect(fight.field.opposing[0]?.state.health).toBe(9); // 10 - 1
        });
    });

    describe('variable_attack_nerf', () => {
        it('开启 nerf：动态 power 卡（moxes）伤害削为 1', async () => {
            const { fight } = await runEvents(
                (fight) => {
                    fight.opts.variableAttackNerf = true;
                    const attacker = placeCard(fight, 'player', 0, 'greenMage'); // power='moxes'
                    attacker.state.sigils = [];
                    placeCard(fight, 'player', 1, 'moxG');
                    placeCard(fight, 'player', 2, 'moxO'); // 2 张 mox → moxes power=2
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = [];
                    defender.state.health = 10;
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );
            // moxes power=2，但 variableAttackNerf 削为 1
            expect(fight.field.opposing[0]?.state.health).toBe(9); // 10 - 1
        });

        it('关闭 nerf：动态 power 卡正常伤害', async () => {
            const { fight } = await runEvents(
                (fight) => {
                    fight.opts.variableAttackNerf = false;
                    const attacker = placeCard(fight, 'player', 0, 'greenMage');
                    attacker.state.sigils = [];
                    placeCard(fight, 'player', 1, 'moxG');
                    placeCard(fight, 'player', 2, 'moxO'); // moxes power=2
                    const defender = placeCard(fight, 'opposing', 0, 'adder');
                    defender.state.sigils = [];
                    defender.state.health = 10;
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );
            // 无 nerf，moxes power=2 正常造成 2 伤
            expect(fight.field.opposing[0]?.state.health).toBe(8); // 10 - 2
        });
    });

    describe('noHammer（锤子守卫）', () => {
        // 临时给 adder 加 noHammer 测试守卫；afterEach 恢复，避免污染其他测试。
        afterEach(() => { delete (PRINTS.adder as { noHammer?: boolean }).noHammer; });

        it('带 noHammer 的卡锤不掉：抛 InvalidAction', async () => {
            (PRINTS.adder as { noHammer?: boolean }).noHammer = true;
            await expect(
                runAction(
                    (fight) => { placeCard(fight, 'player', 0, 'adder'); },
                    'player',
                    { type: 'hammer', lane: 0 },
                ),
            ).rejects.toMatchObject({ type: ErrorType.InvalidAction });
        });

        it('不带 noHammer 的卡正常被锤：发出 perish 事件', async () => {
            const { packet } = await runAction(
                (fight) => { placeCard(fight, 'player', 0, 'adder'); },
                'player',
                { type: 'hammer', lane: 0 },
            );
            expect(packet.settled.some(e => e.type === 'perish')).toBe(true);
        });
    });

    describe('bloodLust (Blood Lust)', () => {
        it('攻击致死目标：攻击者 power +1', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const attacker = placeCard(fight, 'player', 0, 'adder'); // power 2
                    attacker.state.sigils = ['bloodLust'];
                    const target = placeCard(fight, 'opposing', 0, 'adder'); // health 2
                    target.state.sigils = [];
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );

            // target 被击杀后 perish，field 已清空
            expect(fight.field.opposing[0]).toBeNull();
            expect(packet.settled.some(e => e.type === 'perish')).toBe(true);
            // stats 事件触发，攻击者 power +1 = 3
            expect(packet.settled.some(e => e.type === 'stats')).toBe(true);
            expect(fight.field.player[0]?.state.power).toBe(3);
        });

        it('攻击未致死：攻击者 power 不变', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const attacker = placeCard(fight, 'player', 0, 'adder'); // power 2
                    attacker.state.sigils = ['bloodLust'];
                    const target = placeCard(fight, 'opposing', 0, 'adder');
                    target.state.sigils = [];
                    target.state.health = 5; // 不会被击杀
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0] } as Event],
            );

            // target 未死（5 - 2 = 3）
            expect(fight.field.opposing[0]?.state.health).toBe(3);
            // 不触发 stats 事件
            expect(packet.settled.some(e => e.type === 'stats')).toBe(false);
            expect(fight.field.player[0]?.state.power).toBe(2);
        });

        it('direct attack（直接攻击对手）：不触发 bloodLust', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const attacker = placeCard(fight, 'player', 0, 'adder');
                    attacker.state.sigils = ['bloodLust'];
                    // opposing 0 无卡，attack 会 direct
                },
                [{ type: 'attack', from: ['player', 0], to: ['opposing', 0], direct: true } as Event],
            );

            expect(packet.settled.some(e => e.type === 'stats')).toBe(false);
            expect(fight.field.player[0]?.state.power).toBe(2);
        });
    });

    describe('omniStrike (Omni Strike)', () => {
        it('对所有敌方卡各打一次（3 个目标）', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const attacker = placeCard(fight, 'player', 0, 'adder'); // power 2
                    attacker.state.sigils = ['omniStrike'];
                    attacker.state.power = 5; // 确保一击杀
                    // 三个敌方卡，health 10，不会被一击杀以便检查伤害
                    const t0 = placeCard(fight, 'opposing', 0, 'adder');
                    t0.state.sigils = []; t0.state.health = 10;
                    const t1 = placeCard(fight, 'opposing', 1, 'adder');
                    t1.state.sigils = []; t1.state.health = 10;
                    const t2 = placeCard(fight, 'opposing', 2, 'adder');
                    t2.state.sigils = []; t2.state.health = 10;
                },
                [{ type: 'triggerAttack', pos: ['player', 0] } as Event],
            );

            // 应有 3 个 attack 事件（每个敌方卡各 1 次）
            const attacks = packet.settled.filter(e => e.type === 'attack');
            expect(attacks).toHaveLength(3);

            // 三个目标各受 5 伤（10 - 5 = 5）
            expect(fight.field.opposing[0]?.state.health).toBe(5);
            expect(fight.field.opposing[1]?.state.health).toBe(5);
            expect(fight.field.opposing[2]?.state.health).toBe(5);
        });

        it('无敌方卡时回落到默认攻击对位（直接打脸）', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const attacker = placeCard(fight, 'player', 0, 'adder');
                    attacker.state.sigils = ['omniStrike'];
                    attacker.state.power = 3;
                    // 不放任何敌方卡
                },
                [{ type: 'triggerAttack', pos: ['player', 0] } as Event],
            );

            // 只应有 1 个 attack 事件（对位，无目标 → direct）
            const attacks = packet.settled.filter(e => e.type === 'attack');
            expect(attacks).toHaveLength(1);
            // direct attack 加分：player 得 3 分
            expect(fight.points.player).toBe(3);
        });

        it('与 Repulsive 交互：被拒目标不受伤，其他目标正常受伤', async () => {
            const { fight, packet } = await runEvents(
                (fight) => {
                    const attacker = placeCard(fight, 'player', 0, 'adder');
                    attacker.state.sigils = ['omniStrike'];
                    attacker.state.power = 5;
                    // lane 0：Repulsive（voidDamage），attack 应被 cancel
                    const t0 = placeCard(fight, 'opposing', 0, 'adder');
                    t0.state.sigils = ['voidDamage']; t0.state.health = 10;
                    // lane 1：普通卡，应受伤
                    const t1 = placeCard(fight, 'opposing', 1, 'adder');
                    t1.state.sigils = []; t1.state.health = 10;
                },
                [{ type: 'triggerAttack', pos: ['player', 0] } as Event],
            );

            // 2 个 attack 事件生成，但 lane 0 的被 voidDamage cancel（不入 settled）
            const attacks = packet.settled.filter(e => e.type === 'attack');
            expect(attacks).toHaveLength(1); // 只有 lane 1 的成功

            // lane 0 未受伤（attack 被 cancel）
            expect(fight.field.opposing[0]?.state.health).toBe(10);
            // lane 1 受 5 伤
            expect(fight.field.opposing[1]?.state.health).toBe(5);
        });
    });
});

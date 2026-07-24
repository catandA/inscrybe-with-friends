import { ActionReq, ActionRes } from '../engine/Actions';
import { CardPos, FieldPos, getCircuit, getMoxes } from '../engine/Card';
import { MoxType, SigilParam, SigilParamType } from '../engine/constants';
import { EffectTarget, EffectTriggers } from '../engine/Effects';
import { ErrorType, FightError } from '../engine/Errors';
import { FIGHT_SIDES } from '../engine/Fight';
import { cardCanPush, lists, oppositeSide, positions } from '../engine/utils';
import { entries, fromEntries } from '../utils';
import { Buff } from './buffs';

export type SigilPos = [CardPos, Sigil];
export type Sigil = keyof typeof SIGIL_INFOS;
export interface SigilInfo {
    name: string;
    description: string;
    buffs?: readonly Buff[];
    params?: readonly SigilParamType[];
}
export interface SigilEffects<S extends Sigil = never> extends EffectTriggers<S> {
    runAfter?: readonly string[];
    runAs?: EffectTarget;
    runAt?: CardPos[0];
}
export interface SigilDef extends SigilInfo, SigilEffects {}

export type SigilParamMap = {
    -readonly [K in keyof typeof SIGIL_INFOS]: typeof SIGIL_INFOS[K] extends { params: infer P extends readonly SigilParamType[] } ? {
        -readonly [I in keyof P]: SigilParam<P[I]>
    } : never;
};

const SIGIL_INFOS = {
    // Act I
    airborne: {
        name: 'Airborne',
        description: 'This card will ignore opposing cards and strike an opponent directly.',
    },
    antSpawner: {
        name: 'Ant Spawner',
        description: 'When this card is played, a(n) {0} enters your hand.',
        params: ['print'],
    },
    beesWithin: {
        name: 'Bees Within',
        description: 'When this card is struck, a(n) {0} is created in your hand.',
        params: ['print'],
    },
    bellist: {
        name: 'Bellist',
        description: 'When this card is played, a(n) {0} is created on each adjacent empty space.',
        params: ['print'],
    },
    bombSpewer: {
        name: 'Bomb Spewer',
        description: 'When this card is played, all empty spaces are filled with a(n) {0}.',
        params: ['print'],
    },
    boneDigger: {
        name: 'Bone Digger',
        description: 'At the end of the owner\'s turn, this card generates {0} [bones|Bone].',
        params: ['number'],
    },
    bloodLust: {
        name: 'Blood Lust',
        description: 'When this card kills another creature, it gains 1 [power|Power].',
    },
    boneless: {
        name: 'Boneless',
        description: 'When a card bearing this sigil dies, no [bones] are awarded.',
    },
    brittle: {
        name: 'Brittle',
        description: 'After attacking, this card perishes.',
    },
    chaseAttack: {
        name: 'Burrower',
        description: 'This card will move to any empty space that is attacked by an enemy to block it.',
    },
    chaseOpposingPlay: {
        name: 'Guardian',
        description: 'When an opposing card is played opposite an empty space, this card moves to that space.',
    },
    corpseEater: {
        name: 'Corpse Eater',
        description: 'If a card that you own dies by combat, this card is played from your hand on its space.',
    },
    damBuilder: {
        name: 'Dam Builder',
        description: 'When this card is played, a(n) {0} is created on each adjacent empty space.',
        params: ['print'],
    },
    deathTouch: {
        name: 'Death Touch',
        description: 'This card instantly kills any card it damages.',
    },
    detonator: {
        name: 'Detonator',
        description: 'When this card dies, adjacent and opposing cards are dealt {0} damage.',
        params: ['number'],
    },
    doubleAttack: {
        name: 'Double Strike',
        description: 'A card bearing this sigil will strike the opposing space an extra time when attacking.',
    },
    doubleDeath: {
        name: 'Double Death',
        description: 'When another creature you own dies, it dies again.',
    },
    drawCopy: {
        name: 'Fecundity',
        description: 'When this card is played, a copy of it enters your hand.',
    },
    drawCopyKaycee: {
        // Kaycee 变体：复制体去掉 drawCopyKaycee（一次性）。
        // 普通 Fecundity（drawCopy）复制体保留符文，可无限增殖。
        name: 'Fecundity (Kaycee)',
        description: 'When this card is played, a copy of it without this sigil enters your hand.',
    },
    drawRabbit: {
        name: 'Rabbit Hole',
        description: 'When this card is played, a Rabbit is created in your hand.',
    },
    evolve: {
        name: 'Fledgling',
        description: 'A card bearing this sigil will grow into it\'s evolution after 1 turn on the board.',
    },
    fourBones: {
        name: 'Bone King',
        description: 'When this card dies, 4 [bones|Bones] are awarded instead of 1.',
    },
    frozen: {
        name: 'Frozen Away',
        description: 'When this card perishes, the creature inside takes its place.',
    },
    gainBattery: {
        name: 'Battery Bearer',
        description: 'When this card is played, you gain an [energy|Energy Cell].',
    },
    hoarder: {
        name: 'Hoarder',
        description: 'When this card is played, choose a card from your deck to be drawn immediately.',
    },
    leader: {
        name: 'Leader',
        description: 'Creatures adjacent to this card gain 1 [power|Power].',
        buffs: ['incrAdjPower'],
    },
    looter: {
        name: 'Looter',
        description: 'When this card deals damage directly, draw a card for each damage dealt.',
    },
    manyLives: {
        name: 'Many Lives',
        description: 'When this card is sacrificed, it does not perish.',
    },
    mightyLeap: {
        name: 'Mighty Leap',
        description: 'This card blocks opposing Airborne creatures.',
    },
    sentry: {
        name: 'Sentry',
        description: 'When a card moves into the space opposing this card, they are dealt 1 damage.',
    },
    sharp: {
        name: 'Sharp Quills',
        description: 'Once this card is struck, the striker is dealt 1 damage.',
    },
    sniper: {
        name: 'Sniper',
        description: 'You may choose which opposing spaces this card strikes.',
    },
    stinky: {
        name: 'Stinky',
        description: 'The creature opposing this card loses 1 [power|Power].',
        buffs: ['decrOppPower'],
    },
    stone: {
        name: 'Made of Stone',
        description: 'A card bearing this sigil is immune to the effects of Touch of Death and Stinky.',
    },
    armored: {
        name: 'Armored',
        description: 'When this card would take damage, the damage is negated. This sigil is removed after one use.',
    },
    warded: {
        name: 'Warded',
        description: 'When this card would take damage, it takes 1 damage instead.',
    },
    annoying: {
        name: 'Annoying',
        description: 'The creature opposing this card gains 1 [power|Power].',
        buffs: ['incrOppPower'],
    },
    thick: {
        // Thick：占两格。打出时检测相邻空格，召唤另一半并变身为主半。
        // 对齐 Godot Thick.gd：右优先（slot+1 空→召唤 rightHalf 到 slot+1，自身变 leftHalf），
        // 否则左（slot-1 空→召唤 leftHalf 到 slot-1，自身变 rightHalf）。
        // 半卡是普通卡（无 Thick 符文），任一半死亡时另一半独立存活（Godot 无联动移除）。
        name: 'Thick',
        description: 'A card bearing this sigil is juicy, and takes up 2 spaces.',
    },
    skeletonStrafe: {
        name: 'Skeleton Crew',
        description: 'At the end of the owner\'s turn, this card moves in the sigil\'s direction and plays a(n) {0} in the space behind it.',
        params: ['print'],
    },
    squirrelStrafe: {
        name: 'Squirrel Shedder',
        description: 'At the end of the owner\'s turn, this card moves in the sigil\'s direction and plays a(n) {0} in the space behind it.',
        params: ['print'],
    },
    strafe: {
        name: 'Strafe',
        description: 'At the end of the owner\'s turn, this card moves in the sigil\'s direction.',
    },
    strafePush: {
        name: 'Hefty',
        description: 'At the end of the owner\'s turn, this and adjacent cards move in the sigil\'s direction.',
    },
    threeSacs: {
        name: 'Worthy Sacrifice',
        description: 'This card counts as 3 [blood|Blood] rather than 1 [blood|Blood] when sacrificed.',
    },
    tristrike: {
        name: 'Trifurcated Strike',
        description: 'This card will deal damage to the opposing spaces left, right, and opposite of it.',
    },
    bistrike: {
        name: 'Bifurcated Strike',
        description: 'This card will strike each opposing space to the left and right of the spaces across it.',
    },
    omniStrike: {
        name: 'Omni Strike',
        description: 'This card will strike every enemy creature on the board.',
    },
    unkillable: {
        name: 'Unkillable',
        description: 'When this card perishes, a copy of it enters your hand.',
    },
    // Unkillable (Eternal)：复制体去掉 unkillableEternal（一次性）。对齐 Godot Unkillable (Eternal)。
    unkillableEternal: {
        name: 'Unkillable (Eternal)',
        description: 'When this card perishes, a copy of it without this sigil enters your hand.',
    },
    voidDamage: {
        name: 'Repulsive',
        description: 'If a creature would attack this card, it does not.',
    },
    waterborne: {
        name: 'Waterborne',
        description: 'On the opponent\'s turn, creatures attacking this card\'s space attack directly.',
    },
    waterborneTentacle: {
        name: 'Kraken Waterborne',
        description: 'Same as [sigil:waterborne|Waterborne], except that this card becomes a [tribe:Tentacle|Tentacle] card when it emerges.',
    },

    // Mox
    buffGems: {
        name: 'Gem Animator',
        description: '[tribe:mox|Mox] cards on the owner\'s side of the board gain 1 Power.',
        buffs: ['incrMoxPower'],
    },
    dropRubyOnDeath: {
        name: 'Ruby Heart',
        description: 'When this card perishes, a [print:moxO|Ruby Mox] replaces it.',
    },
    gainGemAll: {
        name: 'Great Mox',
        description: 'While this card is on the board, it provides all 3 [mox|Gems] to its owner.',
    },
    gainGemGreen: {
        name: 'Green Mox',
        description: 'While this card is on the board, it provides a Green [mox|Gem].',
    },
    gainGemOrange: {
        name: 'Orange Mox',
        description: 'While this card is on the board, it provides an Orange [mox|Gem].',
    },
    gainGemBlue: {
        name: 'Blue Mox',
        description: 'While this card is on the board, it provides a Blue [mox|Gem].',
    },
    gemsDraw: {
        name: 'Mental Gemnastics',
        description: 'When this card is played, you draw cards equal to the amount of your [tribe:mox|Mox] cards played.',
    },
    gemDependant: {
        name: 'Gem Dependant',
        description: 'If this card\'s owner controls no [tribe:mox|Mox] cards, this card perishes.',
    },

    // Buttons
    activatedStatsUp: {
        name: 'Enlarge',
        description: '[activate|Activate]: Pay {0} [bones|Bones] to increase the [power|Power] and [health|Health] of this card by {1}.',
        params: ['number', 'number'],
    },
    activatedStatsUpEnergy: {
        name: 'Stimulate',
        description: '[activate|Activate]: Pay {0} [energy|Energy] to increase the [power|Power] and [health|Health] of this card by {1}.',
        params: ['number', 'number'],
    },
    activatedEnergyToBones: {
        name: 'Bonehorn',
        description: '[activate|Activate]: Pay {0} [energy|Energy] to gain {1} [bones|Bone].',
        params: ['number', 'number'],
    },
    activatedDiceRollEnergy: {
        name: 'Power Dice',
        description: '[activate|Activate]: Pay {0} [energy|Energy] to set the [power|Power] of this card randomly between 1 and 6.',
        params: ['number'],
    },
    activatedDrawSkeleton: {
        name: 'Disentomb',
        description: '[activate|Activate]: Pay {0} [bones|Bone] to create a(n) {1} in your hand.',
        params: ['number', 'print'],
    },
    activatedSacrificeDraw: {
        name: 'True Scholar',
        description: '[activate|Activate]: If you have a Blue [mox|gem], destroy this card to draw 3 cards.',
        params: ['number'],
    },
    activatedDealDamage: {
        name: 'Energy Gun',
        description: '[activate|Activate]: Pay {0} [energy|Energy] to deal {1} damage to the space across from this card.',
        params: ['number', 'number'],
    },
    // Energy Gun (Eternal)：倾泻所有能量攻击对位卡，伤害=min(能量, 目标血量)。无 params（动态）。
    activatedDealDamageEternal: {
        name: 'Energy Gun (Eternal)',
        description: '[activate|Activate]: Pay [energy|Energy] equal to the opposing creature\'s remaining [health|Health] (or your remaining energy, whichever is lower) to deal that much damage.',
    },
    // Energy Sniper：1 能量选目标 1 伤。用 snipe request 选目标。无 params（固定 1/1）。
    activatedSnipeDamage: {
        name: 'Energy Sniper',
        description: '[activate|Activate]: Pay 1 [energy|Energy] to deal 1 damage to an opposing creature of your choice.',
    },
    // Marrow Sucker：付骨头回血。Godot 无脚本，按描述实现。params: [cost, healAmount]
    activatedHealBones: {
        name: 'Marrow Sucker',
        description: '[activate|Activate]: Pay {0} [bones|Bones] to heal this card by {1}.',
        params: ['number', 'number'],
    },

    conduitGainEnergy: {
        name: 'Energy Conduit',
        description: 'If this card completes a [circuit] when it\'s owner ends their turn, their max [energy|Energy] is increased by {0}.',
        params: ['number'],
    },
    conduitGainPower: {
        name: 'Attack Conduit',
        description: 'Other creatures within a [circuit] completed by this card gain 1 [power|Power].',
        buffs: ['incrCircuitPower'],
    },
    conduitSpawner: {
        name: 'Spawn Conduit',
        description: 'If this card creates a [circuit], a(n) {0} is played in each empty space inside this card\'s circuit at the end of the owner\'s turn.',
        params: ['print'],
    },
    // 真正的 Energy Conduit（能量不耗尽）：对齐 Godot no_energy_deplete。
    // circuit 完成时，本侧 energySpend 事件被 cancel（不扣能量）。
    conduitNoDeplete: {
        name: 'Energy Conduit (No Deplete)',
        description: 'If this card completes a [circuit], [energy|Energy] is not spent when playing cards.',
    },

    // Custom
    vampiric: {
        name: 'Vampiric',
        description: 'When this card attacks another, it heals for the amount of damage dealt.',
    },

    // Acupuncture（主动+被动）：付 3 骨头给敌方加 Stitched；被攻击时伤害转移到 Stitched 卡。
    // 对齐 Godot Acupuncture：Stitched 卡承受原始伤害，Acupuncture 卡只受 1 伤。
    acupuncture: {
        name: 'Acupuncture',
        description: '[activate|Activate]: Pay 3 [bones|Bones] to choose a creature. That creature gains [sigil:stitched|Stitched]. When a card bearing this sigil is struck, a creature with Stitched takes the damage instead, and this card takes 1 damage.',
    },
    // Stitched：被 Acupuncture 附体的卡。Acupuncture 被打时，Stitched 卡承受伤害。
    // 本身无效果处理——重定向逻辑在 Acupuncture.preSettleWrite.attack 中实现。
    stitched: {
        name: 'Stitched',
        description: 'When a card bearing [sigil:acupuncture|Acupuncture] is struck, this card takes the damage instead.',
    },

    // Latch 系列（Phase 2）：死亡时让玩家 snipe 选目标，给目标附加符文。
    // 对齐 Godot：目标可选场上任意卡（友/敌），Latch 卡自身 slot 已空不选。
    bombLatch: {
        name: 'Bomb Latch',
        description: 'When this card perishes, choose a creature. That creature gains [sigil:detonator|Detonator].',
    },
    brittleLatch: {
        name: 'Brittle Latch',
        description: 'When this card perishes, choose a creature. That creature gains [sigil:brittle|Brittle].',
    },
    shieldLatch: {
        name: 'Shield Latch',
        description: 'When this card perishes, choose a creature. That creature gains [sigil:armored|Armored].',
    },
    // Starvation 专属符文：打出时若 attack >= 9，给打出方加 (attack - 8) 优势。
    // 对齐 Godot CardFight.gd:891-896（统一用 playedCard.attack 而非本地 turns_starving，避免双路径分歧）。
    starvationStrike: {
        name: 'Starvation Strike',
        description: 'When this card is played, if its [power|Power] is 9 or greater, its owner gains advantage equal to the [power|Power] minus 8.',
    },
} as const satisfies Record<string, SigilInfo>;

const SIGIL_EFFECTS = {
    airborne: {
        runAs: 'played',
        preSettleWrite: {
            attack(event) { event.direct = true; },
        },
    },
    antSpawner: {
        runAs: 'played',
        postSettle: {
            play(event, [print]) {
                this.createEvent('draw', {
                    side: this.side,
                    card: this.initCard(print),
                });
            },
        },
    },
    beesWithin: {
        runAs: 'attackee',
        preSettleRead: {
            attack(event, [print]) {
                this.createEvent('draw', {
                    side: this.side,
                    card: this.initCard(print),
                });
            },
        },
    },
    bellist: {
        runAs: 'played',
        postSettle: {
            play(event, [print]) {
                this.createEvent('play', {
                    pos: [this.side, event.pos[1] - 1],
                    card: this.initCard(print),
                });
                this.createEvent('play', {
                    pos: [this.side, event.pos[1] + 1],
                    card: this.initCard(print),
                });
            },
        },
    },
    bombSpewer: {
        runAs: 'played',
        postSettle: {
            play(event, [print]) {
                for (const [side, lanes] of entries(this.tick.fight.field)) {
                    for (let lane = 0; lane < lanes.length; lane++) {
                        if (lanes[lane]) continue;
                        this.createEvent('play', {
                            pos: [side, lane],
                            card: this.initCard(print),
                        });
                    }
                }
            },
        },
    },
    boneDigger: {
        runAt: 'field',
        postSettle: {
            phase(event, [bones]) {
                if (event.phase !== 'post-attack') return;
                this.createEvent('bones', {
                    side: this.side,
                    amount: bones,
                });
            },
        },
    },
    bloodLust: {
        // Blood Lust：持有者（攻击者）击杀目标时自身 +1 power。
        // runAs: 'played'（attack 事件中 targets.played = 攻击者位置）。
        // 注：用户原始描述 runAs: 'attackee' 是笔误——attackee 是被打的卡（target），
        // 而 Blood Lust 持有者是击杀方（攻击者），故用 'played'。
        // 仅在 state.power 为 number 时触发；动态 power（ants/hand/bells/moxes/mirror）不触发，避免覆盖 SpecialStat。
        // deathTouch 致死时 target.health 可能非 0，此场景的交互留待后续。
        runAs: 'played',
        postSettle: {
            attack(event) {
                if (event.direct) return; // 直接攻击对手无目标卡，不触发
                const target = this.getCardState(event.to);
                if (!target || target.health !== 0) return; // 目标未死
                if (typeof this.card.state.power !== 'number') return; // 动态 power 卡不触发
                this.createEvent('stats', {
                    pos: this.fieldPos!,
                    power: this.card.state.power + 1,
                });
            },
        },
    },
    brittle: {
        runAs: 'played',
        preSettleRead: {
            attack(event) {
                this.createEvent('perish', { pos: event.from, cause: 'attack' });
            },
        },
    },
    chaseAttack: {
        runAt: 'field',
        preSettleWrite: {
            attack(event) {
                // TODO: centralize this logic
                if (event.direct && !this.card.state.sigils.includes('mightyLeap')) return;
                if (event.to[0] !== this.side) return;
                const target = this.getCard(event.to);
                if (target) return;

                this.prependEvent('move', {
                    from: this.fieldPos!,
                    to: event.to,
                });
            },
        },
    },
    chaseOpposingPlay: {
        runAt: 'field',
        preSettleRead: {
            play(event) {
                if (event.pos[0] === this.side || event.pos[1] === this.fieldPos![1]) return;
                this.createEvent('move', {
                    from: this.fieldPos!,
                    to: positions.opposing(event.pos),
                });
            },
        },
    },
    corpseEater: {
        runAt: 'hand',
        runAs: 'global',
        postSettle: {
            perish(event) {
                if (event.cause === 'sac' || event.cause === 'hammer') return;
                if (!this.tryMark('corpseEater')) return;
                const [side, idx] = this.handPos!;
                if (side !== event.pos[0]) return;
                this.createEvent('play', {
                    pos: event.pos,
                    card: this.tick.fight.hands[side][idx],
                    fromHand: this.handPos!,
                });
            },
        },
    },
    damBuilder: {
        runAs: 'played',
        postSettle: {
            play(event, [print]) {
                this.createEvent('play', {
                    pos: [this.side, event.pos[1] - 1],
                    card: this.initCard(print),
                });
                this.createEvent('play', {
                    pos: [this.side, event.pos[1] + 1],
                    card: this.initCard(print),
                });
            },
        },
    },
    deathTouch: {
        runAs: 'played',
        preSettleRead: {
            attack(event) {
                if (event.direct) return;
                const target = this.getCard(event.to);
                if (!target) return;
                if (target.state.sigils.includes('stone')) return;
                this.createEvent('perish', {
                    pos: event.to,
                    cause: 'death-touch',
                });
            },
        },
    },
    detonator: {
        runAs: 'played',
        preSettleWrite: {
            perish(event, [damage]) {
                if (event.cause === 'sac') return;
                if (!this.tryMark('detonator')) return;
                const opposing = positions.opposing(event.pos);
                const [side, lane] = event.pos;
                this.prependEvent('shoot', {
                    from: event.pos,
                    to: [side, lane - 1],
                    damage,
                });
                this.prependEvent('shoot', {
                    from: event.pos,
                    to: opposing,
                    damage,
                });
                this.prependEvent('shoot', {
                    from: event.pos,
                    to: [side, lane + 1],
                    damage,
                });
            },
        },
    },
    doubleAttack: {
        runAs: 'played',
        preSettleWrite: {
            triggerAttack(event) {
                this.cancelDefault();
                this.createEvent('attack', {
                    from: event.pos,
                    to: positions.opposing(event.pos),
                });
                this.createEvent('attack', {
                    from: event.pos,
                    to: positions.opposing(event.pos),
                });
            },
        },
    },
    drawCopy: {
        // 普通 Fecundity：复制体保留 drawCopy（可无限增殖）。对齐 Godot Fecundity.gd。
        runAs: 'played',
        postSettle: {
            play() {
                const card = this.initCard(this.card.print);
                card.state.sigils = [...this.card.state.sigils];
                this.createEvent('draw', {
                    side: this.side,
                    card,
                });
            },
        },
    },
    drawCopyKaycee: {
        // Kaycee 变体：复制体去掉 drawCopyKaycee（一次性）。对齐 Godot Fecundity (Kaycee).gd。
        runAs: 'played',
        postSettle: {
            play() {
                const card = this.initCard(this.card.print);
                card.state.sigils = lists.subtract(this.card.state.sigils, ['drawCopyKaycee']);
                this.createEvent('draw', {
                    side: this.side,
                    card,
                });
            },
        },
    },
    drawRabbit: {
        runAs: 'played',
        postSettle: {
            play() {
                this.createEvent('draw', {
                    side: this.side,
                    card: this.initCard('rabbit'),
                });
            },
        },
    },
    evolve: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'pre-turn') return;
                const [side] = this.fieldPos!;
                if (this.tick.fight.turn.side !== side) return;
                // TODO: Impl default evolution, maybe a self-buff using CardState['evolved']?
                if (!this.cardPrint.evolution) return;

                let extraSigils = lists.subtract(this.card.state.sigils, this.cardPrint.sigils ?? []);
                extraSigils = lists.subtract(extraSigils, ['evolve']);
                const card = this.initCard(this.cardPrint.evolution);
                card.state.sigils.push(...extraSigils);
                const damage = this.cardPrint.health - this.card.state.health;
                card.state.health -= damage;

                this.createEvent('transform', {
                    pos: this.fieldPos!,
                    card,
                });
            },
        },
    },
    fourBones: {
        runAs: 'played',
        preSettleWrite: {
            perish() {
                this.cancelDefault();
                this.createEvent('bones', {
                    side: this.side,
                    amount: 4,
                });
            },
        },
    },
    frozen: {
        runAs: 'played',
        preSettleRead: {
            perish(event) {
                if (event.cause === 'sac') return;
                const { evolution = 'opossum' } = this.cardPrint;

                this.createEvent('transform', {
                    pos: this.fieldPos!,
                    card: this.initCard(evolution),
                });
            },
        },
    },
    thick: {
        // Thick：占两格。打出时召唤另一半到相邻空格，自身变身为主半。
        // 对齐 Godot Thick.gd：右优先（slot+1 空→召唤 rightHalf，自身变 leftHalf），
        // 否则左（slot-1 空→召唤 leftHalf，自身变 rightHalf）。两槽都被占则不触发。
        runAs: 'played',
        postSettle: {
            play(event) {
                const [side, lane] = event.pos;
                const { leftHalf, rightHalf } = this.cardPrint;
                if (!leftHalf || !rightHalf) return;

                const field = this.tick.fight.field[side];
                const lanes = this.tick.fight.opts.lanes;
                if (lane + 1 < lanes && !field[lane + 1]) {
                    this.createEvent('play', {
                        pos: [side, lane + 1],
                        card: this.initCard(rightHalf),
                    });
                    this.createEvent('transform', {
                        pos: [side, lane],
                        card: this.initCard(leftHalf),
                    });
                } else if (lane > 0 && !field[lane - 1]) {
                    this.createEvent('play', {
                        pos: [side, lane - 1],
                        card: this.initCard(leftHalf),
                    });
                    this.createEvent('transform', {
                        pos: [side, lane],
                        card: this.initCard(rightHalf),
                    });
                }
            },
        },
    },
    gainBattery: {
        runAs: 'played',
        postSettle: {
            play() {
                this.createEvent('energy', {
                    side: this.side,
                    total: 1,
                    amount: 1,
                });
            },
        },
    },
    hoarder: {
        runAs: 'played',
        requests: {
            play: {
                callFor() {
                    if (this.tick.host.decks[this.side].main.length === 0) return null;

                    return [this.side, {
                        type: 'chooseDraw',
                        deck: 'main',
                        choices: this.tick.host.decks[this.side].main.slice().sort((a, b) => a - b),
                    }];
                },
                async onResponse(event, res: ActionRes<'chooseDraw'>, req: ActionReq<'chooseDraw'>) {
                    if (!req.choices.includes(res.idx)) throw FightError.create(ErrorType.InvalidAction, 'Cannot draw card that is not in deck');
                    const side = event.pos[0];
                    this.createEvent('draw', {
                        side,
                        source: req.deck,
                        idx: res.idx,
                    });
                },
            },
        },
    },
    looter: {
        runAs: 'played',
        postSettle: {
            attack(event) {
                if (!event.direct) return;
                for (let i = 0; i < event.damage!; i++) {
                    this.createEvent('draw', {
                        side: this.side,
                        source: 'main',
                    });
                }
            },
        },
    },
    manyLives: {
        runAs: 'played',
        preSettleWrite: {
            perish(event) {
                if (event.cause === 'sac') this.cancel();
            },
        },
    },
    mightyLeap: {
        runAfter: ['airborne'],
        runAs: 'attackee',
        preSettleWrite: {
            attack(event) {
                const attacker = this.getCard(event.from)!;
                if (!attacker.state.sigils.includes('airborne')) return;

                event.direct = false;
            },
        },
    },
    sentry: {
        runAs: 'opposing',
        postSettle: {
            play(event) {
                if (event.transient) return;

                this.createEvent('attack', {
                    from: this.fieldPos!,
                    to: event.pos,
                    damage: 1,
                });
            },
            move(event) {
                this.createEvent('attack', {
                    from: this.fieldPos!,
                    to: event.to,
                    damage: 1,
                });
            },
        },
    },
    sharp: {
        runAs: 'attackee',
        preSettleRead: {
            attack(event) {
                this.createEvent('attack', {
                    from: this.fieldPos!,
                    to: event.from,
                    damage: 1,
                });
            },
        },
    },
    sniper: {
        runAs: 'played',
        preSettleWrite: {
            triggerAttack(event) {
                this.cancelDefault();
            },
        },
        requests: {
            triggerAttack: {
                callFor: (event) => [event.pos[0], { type: 'snipe' }],
                async onResponse(event, res: ActionRes<'snipe'>) {
                    const target = positions.opposing(event.pos, res.lane);
                    this.createEvent('attack', {
                        from: event.pos,
                        to: target,
                        damage: this.getPower(event.pos)!,
                    });
                },
            },
        },
    },
    skeletonStrafe: {
        runAt: 'field',
        postSettle: {
            phase(event, [print]) {
                if (event.phase !== 'post-attack') return;
                SIGIL_EFFECTS.strafe.postSettle.phase.call(this, event);
                this.createEvent('play', {
                    pos: this.fieldPos!,
                    card: this.initCard(print),
                });
            },
        },
    },
    squirrelStrafe: {
        runAt: 'field',
        postSettle: {
            phase(event, [print]) {
                if (event.phase !== 'post-attack') return;
                SIGIL_EFFECTS.strafe.postSettle.phase.call(this, event);
                this.createEvent('play', {
                    pos: this.fieldPos!,
                    card: this.initCard(print),
                });
            },
        },
    },
    strafe: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'post-attack') return;
                const [side, lane] = this.fieldPos!;
                if (this.tick.fight.turn.side !== side) return;
                let toLane =  lane + (this.card.state.backward ? -1 : 1);
                let turnAround = false;
                if (this.getCard([side, toLane]) || toLane < 0 || toLane >= this.tick.fight.opts.lanes) {
                    turnAround = true;
                    toLane = lane + (!this.card.state.backward ? -1 : 1);
                };
                this.createEvent('move', {
                    from: this.fieldPos!,
                    to: [side, toLane],
                    turnAround,
                });
            },
        },
    },
    strafePush: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'post-attack') return;
                const [side, lane] = this.fieldPos!;
                if (this.tick.fight.turn.side !== side) return;
                let dx = this.card.state.backward ? -1 : 1;
                const canPush = cardCanPush(lane, dx, this.tick.fight.field[side]);
                if (!canPush) dx = -dx;
                this.createEvent('push', {
                    from: this.fieldPos!,
                    dx,
                    turnAround: !canPush,
                });
            },
        },
    },
    bistrike: {
        runAs: 'played',
        preSettleWrite: {
            triggerAttack(event) {
                this.cancelDefault();
                const [side, lane] = positions.opposing(event.pos);
                this.createEvent('attack', { from: event.pos, to: [side, lane - 1] });
                this.createEvent('attack', { from: event.pos, to: [side, lane + 1] });
            },
        },
    },
    tristrike: {
        runAs: 'played',
        preSettleWrite: {
            triggerAttack(event) {
                this.cancelDefault();
                const [side, lane] = positions.opposing(event.pos);
                this.createEvent('attack', { from: event.pos, to: [side, lane - 1] });
                this.createEvent('attack', { from: event.pos, to: [side, lane] });
                this.createEvent('attack', { from: event.pos, to: [side, lane + 1] });
            },
        },
    },
    omniStrike: {
        // Godot OmniStrike.gd：modify_attack_targeting 把默认攻击替换为对所有敌方卡各打一次。
        // 无敌方卡时回落到默认（打对位，可能直接打脸）。
        // 与 Repulsive/Brittle 的交互：每个目标独立生成 attack 事件，
        // 被 voidDamage cancel 的不触发 Brittle，未 cancel 的正常触发（对齐 Godot has_attacked 语义）。
        runAs: 'played',
        preSettleWrite: {
            triggerAttack(event) {
                this.cancelDefault();
                const [enemySide] = positions.opposing(event.pos);
                const enemyField = this.tick.fight.field[enemySide];
                let attacked = false;
                for (let lane = 0; lane < enemyField.length; lane++) {
                    if (enemyField[lane] != null) {
                        this.createEvent('attack', { from: event.pos, to: [enemySide, lane] });
                        attacked = true;
                    }
                }
                if (!attacked) {
                    const [opSide, opLane] = positions.opposing(event.pos);
                    this.createEvent('attack', { from: event.pos, to: [opSide, opLane] });
                }
            },
        },
    },
    unkillable: unkillableEffect(false),
    unkillableEternal: unkillableEffect(true),
    voidDamage: {
        runAs: 'attackee',
        preSettleWrite: {
            attack() { this.cancel(); },
        },
    },
    armored: {
        // Godot Armored.gd：首次受伤完全免疫（FULLY_NEGATED_DAMAGE_VAL），之后高亮消失。
        // Web 用 CardState.armoredUsed 标记替代 Godot 的 Highlight 可见性。
        runAs: 'attackee',
        preSettleWrite: {
            attack(event) {
                if (this.card.state.armoredUsed) return;
                this.card.state.armoredUsed = true;
                event.damage = 0;
                event.negated = true;  // 防止 isEventInvalid 把 damage=0 的 attack 当无效拦截
            },
            shoot(event) {
                if (this.card.state.armoredUsed) return;
                this.card.state.armoredUsed = true;
                event.damage = 0;
            },
        },
    },
    warded: {
        // Godot Warded.gd：return max(dmg_amt, 1)（原 bug：至少 1 伤害而非最多 1 伤害）。
        // Web 修正为「每次最多受 1 伤」（return 1），见 porting-notes.md 偏离记录。
        runAs: 'attackee',
        preSettleWrite: {
            attack(event) {
                event.damage = 1;
            },
            shoot(event) {
                event.damage = 1;
            },
        },
    },
    waterborne: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'pre-turn') return;
                const isRowTurn = this.tick.fight.turn.side === this.side;
                const shouldFlip = +isRowTurn ^ +!this.card.state.flipped;
                if (shouldFlip) this.createEvent('flip', { pos: this.fieldPos! });
            },
        },
    },
    waterborneTentacle: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'pre-turn') return;

                const isRowTurn = this.tick.fight.turn.side === this.side;
                const shouldFlip = +isRowTurn ^ +!this.card.state.flipped;

                const willEmerge = this.card.state.flipped && shouldFlip;
                transform: if (willEmerge) {
                    const tentacleCards = Object.entries(this.prints).filter(([id, card]) => card.tribes?.includes('tentacle'));
                    const otherTentacleCards = tentacleCards.filter(([id]) => id !== this.card.print);
                    if (!otherTentacleCards.length) break transform;

                    const [tentacleCard] = this.tick.rng.pick(otherTentacleCards);
                    const card = this.initCard(tentacleCard);
                    card.state.flipped = true;
                    this.createEvent('transform', {
                        pos: this.fieldPos!,
                        card: card,
                    });
                };

                if (shouldFlip) this.createEvent('flip', { pos: this.fieldPos! });
            },
        },
    },
    doubleDeath: {
        runAt: 'field',
        preSettleRead: {
            perish(event) {
                if (event.cause === 'transient') return;
                if (event.pos[0] !== this.side) return;
                if (event.pos[1] === this.fieldPos![1]) return;

                const card = this.getCard(event.pos);
                if (!card) return;

                this.createEvent('play', {
                    pos: event.pos,
                    card,
                    transient: true,
                });
            },
            play(event) {
                if (!event.transient) return;
                this.createEvent('perish', {
                    pos: event.pos,
                    cause: 'transient',
                });
            },
        },
    },
    dropRubyOnDeath: {
        // 修正：原 postSettle.perish 在卡牌移除后无法触发（getActiveSigils 找不到已移除的卡）。
        // 改为 preSettleRead.perish（卡牌仍在场时触发），与 frozen/fourBones 一致。
        runAs: 'played',
        preSettleRead: {
            perish() {
                this.createEvent('play', {
                    pos: this.fieldPos!,
                    card: this.initCard('moxO'),
                });
            },
        },
    },
    gemsDraw: {
        runAs: 'played',
        postSettle: {
            play() {
                const [side] = this.fieldPos!;
                const moxCount = this.tick.fight.field[side].filter((pos) => {
                    return pos?.print && this.prints[pos.print].tribes?.includes('mox');
                }).length;
                for (let i = 0; i < moxCount; i++) {
                    this.createEvent('draw', {
                        side: this.side,
                        source: 'main',
                    });
                }
            },
        },
    },
    gemDependant: {
        runAt: 'field',
        postSettle: {
            play() {
                const [side] = this.fieldPos!;
                const moxCount = this.tick.fight.field[side].filter((pos) => {
                    return pos?.print && this.prints[pos.print].tribes?.includes('mox');
                }).length;
                if (moxCount > 0) return;
                this.createEvent('perish', {
                    pos: this.fieldPos!,
                    cause: 'attack',
                });
            },
            phase() {
                if (this.tick.fight.turn.phase !== 'pre-turn' && this.tick.fight.turn.phase !== 'post-attack') return;
                SIGIL_EFFECTS.gemDependant.postSettle.play.call(this);
            },
        },
    },
    activatedStatsUp: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost, incr]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].bones < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough bones.');
                this.createEvent('bones', {
                    side,
                    amount: -cost,
                });
                this.createEvent('stats', {
                    pos: event.pos,
                    power: this.getPower(event.pos)! + incr,
                    health: this.card.state.health + incr,
                });
            },
        },
    },
    activatedStatsUpEnergy: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost, incr]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].energy[0] < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough energy.');
                this.createEvent('energySpend', {
                    side,
                    amount: cost,
                });
                this.createEvent('stats', {
                    pos: event.pos,
                    power: this.getPower(event.pos)! + incr,
                    health: this.card.state.health + incr,
                });
            },
        },
    },
    activatedEnergyToBones: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost, bones]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].energy[0] < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough energy.');
                this.createEvent('energySpend', {
                    side,
                    amount: cost,
                });
                this.createEvent('bones', {
                    side,
                    amount: bones,
                });
            },
        },
    },
    activatedDiceRollEnergy: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].energy[0] < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough energy.');
                this.createEvent('energySpend', {
                    side,
                    amount: cost,
                });
                const power = this.tick.rng.intInclusive(1, 6);
                this.createEvent('stats', {
                    pos: event.pos,
                    power,
                });
            },
        },
    },
    activatedDrawSkeleton: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost, print]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].bones < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough bones.');
                this.createEvent('bones', {
                    side,
                    amount: -cost,
                });
                this.createEvent('draw', {
                    side,
                    card: this.initCard(print),
                });
            },
        },
    },
    activatedSacrificeDraw: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [amount]) {
                const [side] = event.pos;
                if (!(getMoxes(this.tick.fight.field[side]) & MoxType.Blue))
                    throw FightError.create(ErrorType.InsufficientResources, 'Requires a blue gem.');

                this.createEvent('perish', {
                    pos: event.pos,
                    cause: 'attack',
                });
                for (let i = 0; i < amount; i++) {
                    this.createEvent('draw', {
                        side,
                        source: 'main',
                    });
                }
            },
        },
    },
    activatedDealDamage: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost, damage]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].energy[0] < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough energy.');
                const targetPos = positions.opposing(event.pos);
                const target = this.getCard(targetPos);
                if (!target) throw FightError.create(ErrorType.InvalidPositionAccess, 'Energy Gun must attack a card.');
                this.createEvent('energySpend', {
                    side,
                    amount: cost,
                });
                this.createEvent('shoot', {
                    from: event.pos,
                    to: targetPos,
                    damage,
                });
            },
        },
    },
    // Energy Gun (Eternal)：倾泻能量直至目标死亡或能量耗尽。
    // 伤害 = min(当前能量, 目标剩余血量)。无 params（动态计算）。
    activatedDealDamageEternal: {
        runAs: 'played',
        preSettleRead: {
            activate(event) {
                const [side] = event.pos;
                const targetPos = positions.opposing(event.pos);
                const target = this.getCard(targetPos);
                if (!target) throw FightError.create(ErrorType.InvalidPositionAccess, 'Energy Gun must attack a card.');
                const energy = this.tick.fight.players[side].energy[0];
                const dmg = Math.min(energy, target.state.health);
                if (dmg < 1) throw FightError.create(ErrorType.InsufficientResources, 'Not enough energy.');
                this.createEvent('energySpend', { side, amount: dmg });
                this.createEvent('shoot', { from: event.pos, to: targetPos, damage: dmg });
            },
        },
    },
    // Energy Sniper：1 能量选目标 1 伤。用 snipe request 让玩家选目标。
    activatedSnipeDamage: {
        runAs: 'played',
        requests: {
            activate: {
                callFor(event) {
                    const [side] = event.pos;
                    if (this.tick.fight.players[side].energy[0] < 1) return null;
                    const enemySide = oppositeSide(side);
                    const hasTarget = this.tick.fight.field[enemySide].some(c => c != null);
                    if (!hasTarget) return null;
                    return [side, { type: 'snipe' }];
                },
                async onResponse(event, res: ActionRes<'snipe'>) {
                    const [side] = event.pos;
                    const targetSide = oppositeSide(side);
                    const target: FieldPos = [targetSide, res.lane];
                    this.createEvent('energySpend', { side, amount: 1 });
                    this.createEvent('shoot', { from: event.pos, to: target, damage: 1 });
                },
            },
        },
    },
    // Marrow Sucker：付骨头回血。Godot 无脚本，按描述最小实现。
    activatedHealBones: {
        runAs: 'played',
        preSettleRead: {
            activate(event, [cost, healAmount]) {
                const [side] = event.pos;
                if (this.tick.fight.players[side].bones < cost) throw FightError.create(ErrorType.InsufficientResources, 'Not enough bones.');
                this.createEvent('bones', { side, amount: -cost });
                this.createEvent('heal', { pos: event.pos, amount: healAmount });
            },
        },
    },

    conduitGainEnergy: {
        runAt: 'field',
        postSettle: {
            phase(event, [amount]) {
                const [side, lane] = this.fieldPos!;
                const { turn, field } = this.tick.fight;
                if (turn.phase !== 'pre-turn' || turn.side !== side) return;
                const circuit = getCircuit(this.prints, field[side]);
                if (circuit[lane] == null) return;
                this.createEvent('energy', {
                    side,
                    amount: 0,
                    total: amount,
                });
            },
        },
    },
    conduitSpawner: {
        runAt: 'field',
        preSettleRead: {
            phase(event, [print]) {
                const [side] = this.fieldPos!;
                const { turn, field, opts } = this.tick.fight;
                if (event.phase !== 'post-attack' || turn.side !== side) return;
                const circuit = getCircuit(this.prints, field[side]);
                for (let lane = 0; lane < opts.lanes; lane++) {
                    if (circuit[lane] !== 'circuit') continue;
                    this.createEvent('play', {
                        card: this.initCard(print),
                        pos: [side, lane],
                    });
                }
            },
        },
    },
    conduitNoDeplete: {
        // Energy Conduit（能量不耗尽）：本卡在 circuit 中时，本侧 energySpend 事件被 cancel。
        // 对齐 Godot no_energy_deplete：circuit 完成时打出卡牌不扣能量。
        // runAt: 'field' + 无 runAs → 默认 global，对所有事件激活；
        // 但仅定义了 preSettleWrite.energySpend，只会在 energySpend 事件时触发。
        runAt: 'field',
        preSettleWrite: {
            energySpend(event) {
                if (event.side !== this.side) return;
                const [side, lane] = this.fieldPos!;
                const circuit = getCircuit(this.prints, this.tick.fight.field[side]);
                if (circuit[lane] == null) return; // 本卡不在 circuit 中
                this.cancel();
            },
        },
    },

    vampiric: {
        runAs: 'played',
        postSettle: {
            attack(event) {
                if (event.direct) return;

                const target = this.getCardState(event.to);
                if (!target) return;
                const targetHealth = target.health;
                const healAmount = Math.min(targetHealth, event.damage!);
                this.createEvent('heal', {
                    pos: this.fieldPos!,
                    amount: healAmount,
                });
            },
        },
    },

    // Acupuncture：主动付 3 骨头给目标加 Stitched；被动被攻击时 Stitched 卡承受攻击者 power 的伤害。
    // 对齐 Godot Stitched.gd + CardSlots.gd:838-853。
    // 用 runAt:'field' + 手动目标过滤，解决主动(runAs:'played')与被动(runAs:'attackee')需不同 runAs 的问题。
    acupuncture: {
        runAt: 'field',
        requests: {
            activate: {
                callFor(event) {
                    if (!positions.isSameField(this.fieldPos!, event.pos)) return null;
                    const [side] = event.pos;
                    if (this.tick.fight.players[side].bones < 3) return null;
                    const [mySide, myLane] = event.pos;
                    const hasTarget = FIGHT_SIDES.some(s =>
                        this.tick.fight.field[s].some((c, lane) =>
                            c != null && !(s === mySide && lane === myLane)));
                    if (!hasTarget) return null;
                    return [side, { type: 'snipe' }];
                },
                async onResponse(event, res: ActionRes<'snipe'>) {
                    const [side] = event.pos;
                    const targetSide = res.side ?? side;
                    const target: FieldPos = [targetSide, res.lane];
                    if (positions.isSameField(target, event.pos)) return;
                    this.createEvent('bones', { side, amount: -3 });
                    this.createEvent('newSigil', {
                        pos: ['field', target],
                        sigil: 'stitched' as Sigil,
                    });
                },
            },
        },
        preSettleWrite: {
            attack(event) {
                // 仅当本卡是被攻击者时触发
                if (!positions.isSameField(this.fieldPos!, event.to)) return;
                // 找场上第一张 Stitched 卡，让它承受攻击者 power 的伤害
                for (const side of FIGHT_SIDES) {
                    for (let lane = 0; lane < this.tick.fight.opts.lanes; lane++) {
                        const card = this.tick.fight.field[side][lane];
                        if (card?.state.sigils.includes('stitched')) {
                            const dmg = this.getPower(event.from) ?? 0;
                            if (dmg < 1) return;
                            this.createEvent('shoot', {
                                from: event.from,
                                to: [side, lane],
                                damage: dmg,
                            });
                            return;
                        }
                    }
                }
            },
        },
    },
    // Stitched：纯标记符文，重定向逻辑在 Acupuncture.preSettleWrite.attack 中实现。
    stitched: {},

    // Latch 系列：死亡时 snipe 选目标，给目标附加指定符文。
    // 对齐 Godot：目标可选场上任意卡（友/敌）。Latch 卡自身 slot 已空（perish 已 settle）。
    // requests 在 preSettle 阶段收集（卡牌仍在场），onResponse 在 handleResponse 中调用。
    bombLatch: latchEffect('detonator'),
    brittleLatch: latchEffect('brittle'),
    shieldLatch: latchEffect('armored'),

    // Starvation 专属：打出时若 attack >= 9，给打出方加 (attack - 8) 优势。
    // 对齐 Godot CardFight.gd:891-896（统一用 playedCard.attack）。
    starvationStrike: {
        runAs: 'played',
        postSettle: {
            play(event) {
                const power = this.getPower(event.pos);
                if (power != null && power >= 9) {
                    // 给打出方加 (power - 8) 优势。
                    // Godot inflict_damage(-turns_starving + 8) 从受击方视角是 -(turns_starving - 8)，
                    // 即给对手 +(turns_starving - 8) 优势。Web 中 points[打出方] += power - 8。
                    this.createEvent('points', {
                        side: this.side,
                        amount: power - 8,
                    });
                }
            },
        },
    },
} satisfies {
    [S in Sigil]?: SigilEffects<S>;
};

/**
 * Latch 系列共用工厂：死亡时请求 snipe，选中目标后赋予指定 sigil。
 * 对齐 Godot Bomb/Brittle/Shield Latch.gd。
 */
function latchEffect(grantSigil: Sigil): SigilEffects<'bombLatch' | 'brittleLatch' | 'shieldLatch'> {
    return {
        runAs: 'played',
        requests: {
            perish: {
                callFor(event) {
                    // 场上无其他卡（排除自身）则不触发。
                    // preSettle 阶段 Latch 卡仍在场，必须排除自身 position。
                    const [mySide, myLane] = event.pos;
                    const hasTarget = FIGHT_SIDES.some(side =>
                        this.tick.fight.field[side].some((c, lane) =>
                            c != null && !(side === mySide && lane === myLane)));
                    if (!hasTarget) return null;
                    return [this.side, { type: 'snipe' }];
                },
                async onResponse(event, res: ActionRes<'snipe'>) {
                    const latcherSide = event.pos[0];
                    const targetSide = res.side ?? oppositeSide(latcherSide);
                    const target: FieldPos = [targetSide, res.lane];
                    // 不选自身 slot（已死，但防御性检查）
                    if (positions.isSameField(target, event.pos)) return;
                    this.createEvent('newSigil', {
                        pos: ['field', target],
                        sigil: grantSigil,
                    });
                },
            },
        },
    };
}

/**
 * Unkillable 共用工厂：死亡时复制一张到手牌。
 * - 普通（stripsSigil=false）：复制体保留所有符文（对齐 Godot Unkillable.gd）。
 * - Eternal 变体（stripsSigil=true）：复制体去掉 unkillableEternal（一次性，对齐 Godot Unkillable (Eternal)）。
 * ouroboros 的 +1/+1 成长逻辑两种变体都保留。
 */
function unkillableEffect(stripsSigil: boolean): SigilEffects<'unkillable' | 'unkillableEternal'> {
    return {
        runAs: 'played',
        preSettleRead: {
            perish() {
                const card = this.initCard(this.card.print);
                // 修复原 bug：原代码 card.state.sigils = this.card.state.sigils 是引用赋值，
                // 会让复制体和原卡共享同一数组。改为拷贝。
                if (stripsSigil) {
                    card.state.sigils = lists.subtract(this.card.state.sigils, ['unkillableEternal']);
                } else {
                    card.state.sigils = [...this.card.state.sigils];
                }
                // TODO - Redo this using a card print effect system
                if (this.card.print === 'ouroboros' && typeof card.state.power === 'number') {
                    card.state.power += 1;
                    card.state.health += 1;
                }
                this.createEvent('draw', {
                    side: this.side,
                    card,
                });
            },
        },
    };
}

export const sigilInfos: Record<string, SigilInfo> = SIGIL_INFOS;
export const sigils: Record<string, SigilDef> = fromEntries(entries(SIGIL_INFOS).map<[Sigil, SigilDef]>(([id, info]) => [id, { ...info, ...(SIGIL_EFFECTS as Record<string, SigilEffects>)[id] }]));

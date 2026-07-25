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
    // Fledgling 2：2 回合后进化。对齐 Godot Fledgling 2.gd——用 state.turnsOnBoard 计数，
    // 达到 2 时 transform 到 evolution；不到则递增计数。
    fledgling2: {
        name: 'Fledgling 2',
        description: 'A card bearing this sigil will grow into it\'s evolution after 2 turns on the board.',
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

    // ===== Phase 2 第四批：剩余符文（对齐 Godot working_sigils） =====

    // Noble Sacrifice：牺牲时算 2 blood（基础 1 + bonus 1）。对齐 Godot Noble Sacrifice.gd::bonus_blood。
    // 实际逻辑在 getBloods（lib/engine/Card.ts）中。
    nobleSacrifice: {
        name: 'Noble Sacrifice',
        description: 'A card bearing this sigil is counted as 2 [blood|Blood] rather than 1 [blood|Blood] when sacrificed.',
    },
    // Depleting：打出时移除 2 max energy。对齐 Godot Depleting.gd（max_energy -= 2）。
    depleting: {
        name: 'Depleting',
        description: 'When this card is played, 2 [energy|Energy Cells] are removed from its owner.',
    },
    // Skeleton Crew (Yarr)：strafe + 在原位置生成 Skeleton Crew 卡（带 Brittle）。对齐 Godot Skeleton Crew (Yarr).gd。
    skeletonCrewYarr: {
        name: 'Skeleton Crew (Yarr)',
        description: 'At the end of the owner\'s turn, this card moves in the sigil\'s direction and plays a(n) {0} in the space behind it.',
        params: ['print'],
    },
    // Bomb Spewer (Eternal)：打出时，所有对位有敌方卡的空友方格召唤 Explode Bot。对齐 Godot Bomb Spewer (Eternal).gd。
    bombSpewerEternal: {
        name: 'Bomb Spewer (Eternal)',
        description: 'When this card is played, fill every empty space opposing a card with a(n) {0}.',
        params: ['print'],
    },
    // Steel Trap：死亡时杀死对面卡，并给对手手牌加一张 Pelt（Wolf/Golden/Rabbit 取决于目标）。
    // 对齐 Godot Steel Trap.gd。
    steelTrap: {
        name: 'Steel Trap',
        description: 'When this card perishes, the creature opposing it perishes as well. A Pelt is created in your opponent\'s hand.',
    },
    // Scavenger：敌方死亡时也给自己 +1 bone。对齐 Godot Scavenger.gd。
    scavenger: {
        name: 'Scavenger',
        description: 'While this card is alive on the board, opposing creatures also grant you [bones|Bones] upon death.',
    },
    // Transformer：每回合 transform 到 evolution（beast 形态）。beast 的 evolution 指回原卡，实现来回切换。
    // 对齐 Godot Transformer.gd（extends Fledgling，每回合触发）。
    transformer: {
        name: 'Transformer',
        description: 'At the beginning of your turn a card bearing this sigil will transform to, or from, Beast mode.',
    },
    // Amalgamation：打出时吸收友方属性（power/health/sigils）。对齐 Godot Amalgamation.gd。
    amalgamation: {
        name: 'Amalgamation',
        description: 'A card bearing this sigil assimilates the owner\'s other creatures, gaining their health, power and sigils.',
    },
    // Gem Guardian：打出时给所有友方 Mox 卡 +Armored sigil。对齐 Godot Gem Guardian.gd。
    gemGuardian: {
        name: 'Gem Guardian',
        description: 'When this card is played, all [tribe:mox|Mox] cards on the owner\'s side of the board gain [sigil:armored|Armored].',
    },
    // Gem Detonator：友方 Mox 死亡时触发 Detonator 5（打对面+相邻友方）。对齐 Godot Gem Detonator (5).gd。
    gemDetonator: {
        name: 'Gem Detonator (5)',
        description: 'When [tribe:mox|Mox] cards on the owner\'s side of the board die, they Detonate (the creature opposing them, as well as adjacent friendly creatures, are dealt {0} damage).',
        params: ['number'],
    },
    // Handy：打出时弃手牌（除刚抽的），抽 4 张主牌库。对齐 Godot Handy.gd。
    handy: {
        name: 'Handy',
        description: 'When this card is played, discard your hand then draw a new hand of 4 cards.',
    },
    // Vessel Printer：被攻击时从 side deck 抽 1 张。对齐 Godot Vessel Printer.gd。
    vesselPrinter: {
        name: 'Vessel Printer',
        description: 'Once this card is struck, draw a card from your side deck.',
    },
    // Side Hustle：直接伤害时，从 side deck 抽 damage 张。对齐 Godot Side Hustle.gd::on_damage_scale。
    sideHustle: {
        name: 'Side Hustle',
        description: 'When this card deals damage directly, draw a card from your side deck for each damage dealt.',
    },
    // Reconstitute：2 回合后返回手牌。对齐 Godot Reconstitute.gd（gold_sarcophagus 计时器）。
    reconstitute: {
        name: 'Reconstitute',
        description: 'A card bearing this sigil returns to your hand 2 turns after it perishes.',
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

    // ===== Phase 2 第四批：剩余符文 effects =====

    // Fledgling 2：pre-turn 时递增 turnsOnBoard，达到 2 时 transform 到 evolution。
    // 对齐 Godot Fledgling 2.gd（替换为 Fledgling，下回合再进化——Web 用计数器更直接）。
    fledgling2: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'pre-turn') return;
                const [side] = this.fieldPos!;
                if (this.tick.fight.turn.side !== side) return;
                if (!this.cardPrint.evolution) return;

                const turns = (this.card.state.turnsOnBoard ?? 0) + 1;
                if (turns < 2) {
                    // 用 stats 事件回写计数？stats 只能改 power/health，不能改 turnsOnBoard。
                    // 直接 mutate state（pre-turn 阶段安全，不影响事件序列化）。
                    this.card.state.turnsOnBoard = turns;
                    return;
                }
                // 达到 2 回合，进化。
                let extraSigils = lists.subtract(this.card.state.sigils, this.cardPrint.sigils ?? []);
                extraSigils = lists.subtract(extraSigils, ['fledgling2']);
                const card = this.initCard(this.cardPrint.evolution);
                card.state.sigils.push(...extraSigils);
                const damage = this.cardPrint.health - this.card.state.health;
                card.state.health -= damage;
                this.createEvent('transform', { pos: this.fieldPos!, card });
            },
        },
    },
    // Depleting：打出时 -2 max energy，并 clamp 当前 energy 到新 max。
    // 对齐 Godot Depleting.gd（set_max_energy(max-2); set_energy(min(new_max, energy))）。
    // energy settler 对 total<0 会扣 maxEnergy 但不 clamp energy[0]（Math.max(energy[1], energy[0]) 会拉回），
    // 故此处直接 mutate state（postSettle 阶段安全，state 改变经 translateFight 同步给客户端）。
    depleting: {
        runAs: 'played',
        postSettle: {
            play() {
                const player = this.tick.fight.players[this.side];
                const newMax = Math.max(0, player.energy[1] - 2);
                player.energy[1] = newMax;
                player.energy[0] = Math.min(newMax, player.energy[0]);
            },
        },
    },
    // Skeleton Crew (Yarr)：strafe + 在原位置生成 Skeleton Crew 卡。
    // 复用 skeletonStrafe 模式，仅 print 参数不同（sigilParams 配 'skeletonCrew'）。
    skeletonCrewYarr: {
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
    // Bomb Spewer (Eternal)：打出时，所有对位有敌方卡的空友方格召唤 print。
    // 对齐 Godot Bomb Spewer (Eternal).gd：遍历所有 lane，友方空+对位有敌方卡时召唤。
    bombSpewerEternal: {
        runAs: 'played',
        postSettle: {
            play(event, [print]) {
                const [side] = event.pos;
                const friendlyField = this.tick.fight.field[side];
                const enemyField = this.tick.fight.field[oppositeSide(side)];
                for (let lane = 0; lane < this.tick.fight.opts.lanes; lane++) {
                    if (friendlyField[lane] != null) continue;
                    if (enemyField[lane] == null) continue;
                    this.createEvent('play', {
                        pos: [side, lane],
                        card: this.initCard(print),
                    });
                }
            },
        },
    },
    // Steel Trap：死亡时杀死对面卡，给对手手牌加一张 Pelt。
    // 对齐 Godot Steel Trap.gd：根据目标卡 rare/attack 选择 Golden/Rabbit/Wolf Pelt。
    steelTrap: {
        runAs: 'played',
        preSettleRead: {
            perish(event) {
                if (event.cause === 'sac') return;
                const [side, lane] = event.pos;
                const targetPos = positions.opposing(event.pos);
                const target = this.getCard(targetPos);
                // 杀死对面卡
                if (target) {
                    this.createEvent('perish', {
                        pos: targetPos,
                        cause: 'attack',
                    });
                }
                // 选择 Pelt 类型
                const targetPrint = target ? this.prints[target.print] : null;
                let peltId = 'wolfPelt';
                if (targetPrint?.rare) peltId = 'goldenPelt';
                else if (targetPrint && targetPrint.power === 0) peltId = 'rabbitPelt';
                // 给对手（敌方视角的对手=死亡方）加 pelt
                this.createEvent('draw', {
                    side: oppositeSide(side),
                    card: this.initCard(peltId),
                });
            },
        },
    },
    // Scavenger：敌方死亡时也给自己 +1 bone。对齐 Godot Scavenger.gd。
    // 用 preSettleRead（postSettle 时死亡卡已从场上移除，无法读 sigils）。
    // Godot 语义：默认给死亡方自己 +1，Scavenger 额外给持有方 +1（「也给自己」）。
    scavenger: {
        runAt: 'field',
        preSettleRead: {
            perish(event) {
                // 仅当死亡方是敌方时触发
                if (event.pos[0] === this.side) return;
                // 死亡的卡若有 boneless，默认不给骨头，Scavenger 也不给（对齐 Godot）
                const deadCard = this.getCard(event.pos);
                if (deadCard?.state.sigils.includes('boneless')) return;
                // 对齐 Godot Scavenger.gd：窃取对方骨头——给自己 +1，扣对方 -1。
                // 默认死亡 +1 事件已入 queue（defaultEffects.preSettle.perish 先于 preSettleRead），
                // 但尚未 settle，所以这里不能直接读 players.bones 判断；无条件扣 -1，
                // 事件处理顺序保证最终结果 = 默认 +1 - Scavenger -1 = 0（不会变负，因 boneless 已守卫）。
                this.createEvent('bones', { side: this.side, amount: 1 });
                this.createEvent('bones', { side: event.pos[0], amount: -1 });
            },
        },
    },
    // Transformer：每回合 transform 到 evolution（来回切换）。
    // 对齐 Godot Transformer.gd（extends Fledgling，每回合触发而非一次性）。
    // 复用 evolve 的逻辑，但不删除 transformer 符文（让下回合再触发）。
    transformer: {
        runAt: 'field',
        postSettle: {
            phase(event) {
                if (event.phase !== 'pre-turn') return;
                const [side] = this.fieldPos!;
                if (this.tick.fight.turn.side !== side) return;
                if (!this.cardPrint.evolution) return;

                // 保留额外符文（非 transformer、非 print 自带），转移到新卡。
                let extraSigils = lists.subtract(this.card.state.sigils, this.cardPrint.sigils ?? []);
                extraSigils = lists.subtract(extraSigils, ['transformer']);
                const card = this.initCard(this.cardPrint.evolution);
                card.state.sigils.push(...extraSigils);
                const damage = this.cardPrint.health - this.card.state.health;
                card.state.health -= damage;
                this.createEvent('transform', { pos: this.fieldPos!, card });
            },
        },
    },
    // Amalgamation：打出时吸收友方属性。对齐 Godot Amalgamation.gd。
    // 遍历所有友方卡（排除自身），累加 power/health，收集最多 3 个不重复 sigil。
    amalgamation: {
        runAs: 'played',
        postSettle: {
            play(event) {
                const [side, lane] = event.pos;
                const friendlyField = this.tick.fight.field[side];
                let atkAcc = 0;
                let hpAcc = 0;
                const nSigils: Sigil[] = [];
                for (let l = 0; l < friendlyField.length; l++) {
                    if (l === lane) continue;
                    const fCard = friendlyField[l];
                    if (!fCard) continue;
                    // 累加 power（仅数字 power；动态 power 跳过）
                    if (typeof fCard.state.power === 'number') atkAcc += fCard.state.power;
                    hpAcc += fCard.state.health;
                    // 收集不重复 sigil，最多 3 个
                    for (const s of fCard.state.sigils) {
                        if (nSigils.length >= 3) break;
                        if (!nSigils.includes(s)) nSigils.push(s);
                    }
                    // 友方卡死亡
                    this.createEvent('perish', { pos: [side, l], cause: 'attack' });
                }
                // 自身属性更新
                const newPower = atkAcc;
                const newHealth = Math.max(1, hpAcc);
                this.createEvent('stats', {
                    pos: event.pos,
                    power: newPower,
                    health: newHealth,
                });
                for (const s of nSigils) {
                    this.createEvent('newSigil', { pos: ['field', event.pos], sigil: s });
                }
            },
        },
    },
    // Gem Guardian：打出时给所有友方 Mox 卡 +Armored sigil。对齐 Godot Gem Guardian.gd。
    gemGuardian: {
        runAs: 'played',
        postSettle: {
            play(event) {
                const [side] = event.pos;
                const friendlyField = this.tick.fight.field[side];
                for (let l = 0; l < friendlyField.length; l++) {
                    const card = friendlyField[l];
                    if (!card) continue;
                    if (!this.prints[card.print].tribes?.includes('mox')) continue;
                    if (card.state.sigils.includes('armored')) continue;
                    this.createEvent('newSigil', {
                        pos: ['field', [side, l]],
                        sigil: 'armored' as Sigil,
                    });
                }
            },
        },
    },
    // Gem Detonator：友方 Mox 死亡时触发 Detonator 5（打对面+相邻友方）。
    // 对齐 Godot Gem Detonator (5).gd。runAt:'field' + global，监听 perish。
    // 用 createEvent 而非 prependEvent：prependEvent 的 signals.prepend 检查在 preSettleRead 之前，
    // preSettleRead 中调 prependEvent 会丢失。createEvent 把 shoot 事件入 stack，perish settle 后处理。
    gemDetonator: {
        runAt: 'field',
        preSettleRead: {
            perish(event, [damage]) {
                // 仅当死亡方与本卡同侧（友方）
                if (event.pos[0] !== this.side) return;
                // 排除自身死亡触发
                if (positions.isSameField(event.pos, this.fieldPos!)) return;
                const deadCard = this.getCard(event.pos);
                if (!deadCard) return;
                // 死亡的卡必须是 Mox
                if (!this.prints[deadCard.print].tribes?.includes('mox')) return;
                const [side, lane] = event.pos;
                const opposing = positions.opposing(event.pos);
                // 对面伤害
                this.createEvent('shoot', {
                    from: event.pos,
                    to: opposing,
                    damage,
                });
                // 相邻友方伤害
                this.createEvent('shoot', {
                    from: event.pos,
                    to: [side, lane - 1],
                    damage,
                });
                this.createEvent('shoot', {
                    from: event.pos,
                    to: [side, lane + 1],
                    damage,
                });
            },
        },
    },
    // Handy：打出时弃手牌（除刚抽的），抽 4 张主牌库。
    // 对齐 Godot Handy.gd：side deck 有则抽 1 side + 3 main，否则抽 4 main。
    handy: {
        runAs: 'played',
        postSettle: {
            play(event) {
                const [side] = event.pos;
                // 弃手牌：直接清空手牌数组（对齐 Godot "Discard" animation，简化为直接清空）
                // 注意：刚打出的卡已在 play 事件中 fromHand 移除，这里清空剩余手牌。
                // Web 中没有显式 discard 事件，用 mustPlay=null + 手牌清空模拟。
                // 但 handSize 是计数字段，需要同步递减。
                const hand = this.tick.fight.hands[side];
                const handCount = hand.length;
                hand.length = 0;
                this.tick.fight.players[side].handSize -= handCount;
                // 抽 4 张主牌库（对齐 Godot：side deck 空 -> 4 main）
                for (let i = 0; i < 4; i++) {
                    this.createEvent('draw', { side, source: 'main' });
                }
            },
        },
    },
    // Vessel Printer：被攻击时从 side deck 抽 1 张。对齐 Godot Vessel Printer.gd。
    // runAs: 'attackee'，监听 attack 事件触发抽 side deck。
    vesselPrinter: {
        runAs: 'attackee',
        postSettle: {
            attack(event) {
                if (event.direct) return; // 直接攻击不触发
                this.createEvent('draw', { side: this.side, source: 'side' });
            },
        },
    },
    // Side Hustle：直接伤害时从 side deck 抽 damage 张。对齐 Godot Side Hustle.gd::on_damage_scale。
    sideHustle: {
        runAs: 'played',
        postSettle: {
            attack(event) {
                if (!event.direct) return;
                const dmg = event.damage ?? 0;
                for (let i = 0; i < dmg; i++) {
                    this.createEvent('draw', { side: this.side, source: 'side' });
                }
            },
        },
    },
    // Reconstitute：2 回合后返回手牌。对齐 Godot Reconstitute.gd（gold_sarcophagus 计时器）。
    // 用 state.turnsOnBoard 计数：perish 时记录到 state，下回合 pre-turn 递减，达到 2 时回手。
    // 注意：perish 后卡已移除，无法在 state 上计数——需要外部存储。
    // 简化实现：死亡时立即创建一个 draw 事件（用 initCard 重建），并标记 turnsOnBoard=-2，
    // 后续 pre-turn 时递增到 0 后才真正进入手牌。但这与"返回手牌"语义不符。
    // 当前简化：直接死亡时复制一张到手牌（与 unkillable 一致），但延迟 2 回合。
    // 由于 Web 没有"延迟事件"机制，且 gold_sarcophagus 是 Godot 特有的全局状态，
    // 此处先按"死亡时立即返回手牌"实现（与 unkillable 等价），完整延迟逻辑留待后续。
    reconstitute: {
        runAs: 'played',
        preSettleRead: {
            perish() {
                const card = this.initCard(this.card.print);
                card.state.sigils = [...this.card.state.sigils];
                // Ouroboros +1/+1 成长（对齐 Godot Reconstitute.gd）
                if (this.card.print === 'ouroboros' && typeof card.state.power === 'number') {
                    card.state.power += 1;
                    card.state.health += 1;
                }
                this.createEvent('draw', { side: this.side, card });
            },
        },
    },

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

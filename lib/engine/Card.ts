import { FIGHT_SIDES, Fight, FightSide } from './Fight';
import { positions } from './utils';
import { Sigil, SigilParamMap, sigilInfos } from '../defs/sigils';
import { buffs } from '../defs/buffs';
import { MoxType } from './constants';
import { Trait } from '../defs/traits';

export type SpecialStat =
    | 'ants'
    | 'hand'
    | 'bells'
    | 'moxes'
    | 'mirror';

export type Stat = SpecialStat | number;
export type Cost = {
    type: 'blood';
    amount: number;
} | {
    type: 'bone';
    amount: number;
} | {
    type: 'energy';
    amount: number;
} | {
    type: 'mox';
    needs: number;
};

export interface Ruleset<Strict = false> {
    name: string;
    prints: Record<string, Readonly<CardPrint>>;
    sideDecks: Record<string, Readonly<SideDeck>>;
    sigilParams: Strict extends true ? OmitNever<SigilParamMap> : Record<string, SigilParamMap[keyof SigilParamMap][number][]>;
}
export interface SideDeck {
    name: string;
    /** single 格式：重复 N 张同一卡。对齐 Godot `{ type: "single", card, count }`。 */
    repeat?: [number, string];
    /** single_cat 格式：分类选择，每类是 [count, printId]。对齐 Godot `{ type: "single_cat", cards: { prefix: { card, count } } }`。 */
    singleCat?: Record<string, [number, string]>;
    /** draft 格式：从卡池中选 count 张。对齐 Godot `{ type: "draft", cards: [...], count }`。 */
    draft?: { cards: string[]; count: number };
}

/**
 * 从 SideDeck 定义生成 printId 列表。
 * - repeat：展开为 N 张同一卡。
 * - singleCat：默认返回第一个分类的卡（UI 层可让用户切换分类）。
 * - draft：默认预填卡池前 count 张（UI 层可让用户自由选择）。
 * 无任何字段时返回空数组。
 */
export function getSideDeckPrintIds(sideDeck: SideDeck): string[] {
    const ids: string[] = [];
    if (sideDeck.repeat) {
        ids.push(...Array(sideDeck.repeat[0]).fill(sideDeck.repeat[1]));
    } else if (sideDeck.singleCat) {
        // 默认取第一个分类（UI 层可让用户选）
        const firstCat = Object.values(sideDeck.singleCat)[0];
        if (firstCat) ids.push(...Array(firstCat[0]).fill(firstCat[1]));
    } else if (sideDeck.draft) {
        // 默认预填卡池前 count 张（UI 层可让用户自由选）
        const { cards, count } = sideDeck.draft;
        for (let i = 0; i < Math.min(count, cards.length); i++) ids.push(cards[i]);
    }
    return ids;
};

export type Tribe = 'ant' | 'insect' | 'canine' | 'avian' | 'hooved' | 'reptile' | 'rodent' | 'mox' | 'bell' | 'tentacle';
export interface CardPrint {
    name: string;
    desc?: string;
    portrait?: string;
    face?: 'rare' | 'terrain' | 'rare_terrain' | 'common';
    frame?: 'nature_frame' | 'tech_frame' | 'undead_frame' | 'wizard_frame';

    fused?: boolean;
    banned?: boolean;
    rare?: boolean;
    scrybe?: 'nature' | 'tech' | 'undead' | 'wizard';

    health: number;
    power: Stat;
    cost?: Cost;
    conduit?: boolean;
    noSac?: boolean;
    tribes?: Tribe[];

    /** 免疫锤子（Godot nohammer）。Phase 1 第二批新增，锤子逻辑待接入。 */
    noHammer?: boolean;
    /** Music Player / Jukebot 存储的音乐资源（Godot 端字段名待确认，先占位）。 */
    song?: string;

    sigils?: Sigil[];
    traits?: Trait[];

    evolution?: string;

    /** Thick 符文（占两格）：打出时召唤到相邻空格的另一半卡 printId。对齐 Godot `left_half`/`right_half`。 */
    leftHalf?: string;
    rightHalf?: string;
}
export interface CardState {
    power: Stat;
    health: number;
    sigils: Sigil[];
    flipped?: boolean;
    backward?: boolean;
    evolved?: boolean;
    /** Armored 符文状态标记：true 表示首次免伤已用掉。 */
    armoredUsed?: boolean;
}

export type Card = {
    print: string;
    state: CardState;
};
export type CardOrPrint = {
    print: string;
    state?: CardState;
};
export type CardInfo = {
    print: Readonly<CardPrint>;
    state: CardState;
};
export type FieldPos = [FightSide, number];
export type HandPos = [FightSide, number];
export type CardPos = ['field' | 'hand', HandPos];

export function initCardFromPrint(prints: Record<string, CardPrint>, printId: string): Card {
    const print = prints[printId];
    return {
        print: printId,
        state: {
            power: print.power,
            health: print.health,
            flipped: false,
            sigils: [...print.sigils ?? []],
        },
    };
}

export function getCardPower(prints: Record<string, CardPrint>, fight: Fight<'player'>, pos: FieldPos): number | null {
    const [side, lane] = pos;
    const card = fight.field[side][lane];
    if (card == null) return null;
    let power = 0;

    // Base damage
    if (card.state.power === 'ants') {
        const antCount = fight.field[side].filter(card => card ? prints[card.print].tribes?.includes('ant') : false).length;
        power += Math.min(fight.opts.antLimit, antCount);
    } else if (card.state.power === 'hand') {
        power += fight.players[side].handSize;
    } else if (card.state.power === 'bells') {
        power += fight.opts.lanes - lane;
        const left = fight.field[side][lane - 1];
        const right = fight.field[side][lane + 1];
        if (left && prints[left.print].tribes?.includes('bell')) power++;
        if (right && prints[right.print].tribes?.includes('bell')) power++;
    } else if (card.state.power === 'mirror') {
        const opposingPos = positions.opposing(pos);
        const opposing = fight.field[opposingPos[0]][opposingPos[1]];
        // NOTE: https://youtu.be/lbeG5LjqCT4?t=521
        if (opposing != null && opposing.state.power !== 'mirror')
            power += getCardPower(prints, fight, opposingPos) ?? 0;
    } else if (card.state.power === 'moxes') {
        power += fight.field[side].filter(card => getMoxes([card])).length;
    } else {
        power += card.state.power;
    }

    // (De)buffs
    for (const side of FIGHT_SIDES) {
        for (let lane = 0; lane < fight.opts.lanes; lane++) {
            const card = fight.field[side][lane];
            if (card == null) continue;
            for (const sigil of card.state.sigils) {
                const sigilInfo = sigilInfos[sigil];
                if (!sigilInfo.buffs) continue;
                for (const buff of sigilInfo.buffs)
                    power += buffs[buff].check(fight, [side, lane], pos)?.power ?? 0;
            }
        }
    }

    return Math.max(0, power);
}

export function getMoxes(cards: (Card | null)[]): number {
    let moxes = 0;
    for (const card of cards) {
        if (!card) continue;
        const gainAll = card.state.sigils.includes('gainGemAll');
        if (gainAll || card.state.sigils.includes('gainGemGreen')) moxes |= MoxType.Green;
        if (gainAll || card.state.sigils.includes('gainGemOrange')) moxes |= MoxType.Orange;
        if (gainAll || card.state.sigils.includes('gainGemBlue')) moxes |= MoxType.Blue;
    }
    return moxes;
}

export function getBloods(prints: Record<string, CardPrint>, cards: (Card | null)[]): number {
    let bloods = 0;
    for (const card of cards) {
        if (!card) continue;
        const print = prints[card.print];
        if (print.noSac) continue;
        if (card.state.sigils.includes('threeSacs')) bloods += 3;
        else bloods += 1;
    }
    return bloods;
}

export function getRoomOnSac(field: (Card | null)[], sacs: (Card | null)[]) {
    let room = 0;
    for (const card of field) {
        if (!card) {
            room += 1;
            continue;
        };
        if (sacs.includes(card) && card.state.sigils.includes('manyLives')) continue;
        if (!sacs.includes(card)) continue;
        room += 1;
    }
    return room;
}

export type CircuitSlot = 'left' | 'circuit' | 'right' | null;
export function getCircuit(prints: Record<string, CardPrint>, field: (Card | null)[]): CircuitSlot[] {
    const circuit = new Array<CircuitSlot>(field.length).fill(null);
    const left = field.findIndex(card => card != null && prints[card.print].conduit);
    const right = field.findLastIndex(card => card != null && prints[card.print].conduit);
    if (left === -1 || left === right) return circuit;
    return circuit.map((_, i) => i > left && i < right ? 'circuit' : i === left ? 'left' : i === right ? 'right' : null);
}

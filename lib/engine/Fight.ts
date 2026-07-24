import { Card } from './Card';
import { fromEntries } from '../utils';
import { ActionReq } from './Actions';
import { DECK_TYPES, DeckType, DeckCards } from './Deck';

export enum FightFeatures {
    Anticipated = 'anticipated',
    EarlyPlay = 'early-play',
    Rotary = 'rotary',
}

export const FIGHT_SIDES = ['player', 'opposing'] as const;
export type FightSide = typeof FIGHT_SIDES[number];
export type Phase = 'pre-turn' | 'draw' | 'play' | 'pre-attack' | 'attack' | 'post-attack';
export type FightTurn = {
    side: FightSide;
    phase: Phase;
};

export interface FightOptions {
    lanes: number;
    features: FightFeatures[];
    startingHand: number;
    lives: number;
    hammersPerTurn: number;
    ruleset: string;
    antLimit: number;
    maxEnergy: number;
    // Godot default_header 对齐字段（Phase 1 第二批新增）
    /** 对齐 Godot num_candles；当前与 lives 同义，Phase 2 吹蜡烛机制将统一到此字段。 */
    numCandles: number;
    /** 对齐 Godot starting_bones；createFight 时写入 PlayerState.bones。 */
    startingBones: number;
    /** 对齐 Godot deck_size_min；牌组校验待 Phase 1 后续实现，先占位。 */
    deckSizeMin: number;
    /** 对齐 Godot variable_attack_nerf；true 时动态 power（string）卡伤害削为 1。 */
    variableAttackNerf: boolean;
    // Godot default_header 对齐字段（Phase 1 第三批新增）
    /** 对齐 Godot max_commons_main；主牌组每张 common 卡上限。牌组校验待任务 5 接入。 */
    maxCommonsMain: number;
    /** 对齐 Godot max_commons_side；副牌组每张 common 卡上限。 */
    maxCommonsSide: number;
    /** 对齐 Godot opt_actives；true 时主动技能可选触发。机制待 Phase 2 实现，先占位。 */
    optActives: boolean;
}

export interface Fight<InclSide extends FightSide = never> {
    opts: FightOptions;
    points: Record<FightSide, number>;
    turn: FightTurn;
    waitingFor: {
        side: FightSide;
        req: ActionReq;
    } | null;
    field: Record<FightSide, (Card | null)[]>;
    players: Record<FightSide, PlayerState>;

    // TODO: Move private per-player state to a single key
    mustPlay: Record<InclSide, number | null>;
    hands: Record<InclSide, Card[]>;
    decks: Record<InclSide, DeckCards>;
}

export interface PlayerState {
    deaths: number;
    bones: number;
    energy: [number, number];
    deckSizes: Record<DeckType, number>;
    handSize: number;
    turnHammers: number;
}

const initPlayerState = (): PlayerState => ({
    deaths: 0,
    bones: 0,
    energy: [0, 0],
    deckSizes: fromEntries(DECK_TYPES.map(type => [type, 0])),
    handSize: 0,
    turnHammers: 0,
});

export function createFight<Side extends FightSide = never>(opts: FightOptions, sides: readonly Side[], decks: Record<Side, DeckCards>): Fight<Side> {
    const hands = fromEntries(sides.map(side => [side, []]));
    const mustPlay = fromEntries(sides.map(side => [side, null]));
    return {
        opts,
        points: { player: 0, opposing: 0 },
        turn: { side: 'player', phase: 'pre-turn' },
        waitingFor: null,
        field: {
            player: Array(opts.lanes).fill(null),
            opposing: Array(opts.lanes).fill(null),
        },
        players: {
            player: { ...initPlayerState(), bones: opts.startingBones },
            opposing: { ...initPlayerState(), bones: opts.startingBones },
        },
        hands,
        mustPlay,
        decks,
    };
}

export function translateFight<Side extends FightSide>(hostFight: Fight<FightSide>, side: Side): Fight<'player'> {
    const { opts, points, turn, waitingFor, field, players, mustPlay, hands, decks } = hostFight;
    const opposingSide = side === 'player' ? 'opposing' : 'player';
    return {
        opts,
        points: {
            player: points[side],
            opposing: points[opposingSide],
        },
        turn: turn.side === side ? { ...turn, side: 'player' } : { ...turn, side: 'opposing' },
        waitingFor: waitingFor && {
            side: waitingFor.side === side ? 'player' : 'opposing',
            req: waitingFor.req,
        },
        field: {
            player: field[side],
            opposing: field[opposingSide],
        },
        players: {
            player: players[side],
            opposing: players[opposingSide],
        },
        mustPlay: {
            player: mustPlay[side],
        },
        hands: {
            player: hands[side],
        },
        decks: {
            player: decks[side],
        },
    };
}

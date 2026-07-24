import { z } from 'zod';
import { FightFeatures, FightOptions, FightSide } from '../engine/Fight';
import { DeckCards, DeckType } from '../engine/Deck';
import { Action, ActionRes, PlayerMessage } from '../engine/Actions';
import { rulesets } from '../defs/prints';

// TODO: make more restrictive: maximum array sizes, print id enums, string max lengths, etc.

export const zFightOptions = z.object({
    lanes: z.number(),
    features: z.array(z.union([
        z.literal(FightFeatures.Anticipated),
        z.literal(FightFeatures.EarlyPlay),
        z.literal(FightFeatures.Rotary),
    ])),
    startingHand: z.number(),
    lives: z.number(),
    hammersPerTurn: z.number(),
    // ruleset 校验加固（避坑 #14）：未知 id 在 Zod 阶段拦截，避免运行时 rulesets[id] 崩溃。
    ruleset: z.string().refine(id => id in rulesets, { message: 'Unknown ruleset id' }),
    antLimit: z.number(),
    maxEnergy: z.number(),
    numCandles: z.number(),
    startingBones: z.number(),
    deckSizeMin: z.number(),
    variableAttackNerf: z.boolean(),
    maxCommonsMain: z.number(),
    maxCommonsSide: z.number(),
    optActives: z.boolean(),
    allowSnuffingCandles: z.boolean(),
    snuffCard: z.string(),
}) satisfies z.ZodType<FightOptions>;

export const defaultFightOptions = (ruleset = 'imfComp'): FightOptions => ({
    features: [],
    lanes: 4,
    lives: 2,
    startingHand: 3,
    hammersPerTurn: 1,
    ruleset,
    antLimit: 2,
    maxEnergy: 6,
    // Godot default_header 对齐（见 PORTING_PLAN §3.4 A）
    numCandles: 2,
    startingBones: 0,
    deckSizeMin: 1,
    variableAttackNerf: false,
    maxCommonsMain: 4,
    maxCommonsSide: 10,
    optActives: false,
    // Phase 2 吹蜡烛（对齐 Godot allow_snuffing_candles + snuff_card）
    allowSnuffingCandles: false,
    snuffCard: 'greaterSmoke',
});

export const zDeckCards = z.object({
    main: z.array(z.string()),
    side: z.array(z.string()),
}) satisfies z.ZodType<DeckCards>;

export const zFightSide = z.union([z.literal('player'), z.literal('opposing')]) satisfies z.ZodType<FightSide>;

export const zFightSides = z.object({
    player: z.string(),
    opposing: z.string(),
}) satisfies z.ZodType<Record<FightSide, string>>;

export const zPlayerDecks = z.record(z.string(), z.string().optional()) satisfies z.ZodType<Partial<Record<string, string>>>;

// export const zShuffledDecks = z.object({
//     main: z.array(z.number()),
//     side: z.array(z.number()),
// }) satisfies z.ZodType<ShuffledDecks>;

// export const zFightHost = z.object({
//     fight: {},
//     decks: z.record(zFightSide, zShuffledDecks),
// }) satisfies z.ZodType<FightHost>;

// export const zEvent = z.object({
//     type: z.string(),
//     side: zFightSide,
// });

export const zDeckType = z.union([z.literal('main'), z.literal('side')]) satisfies z.ZodType<DeckType>;

export const zAction = z.union([
    z.object({
        type: z.literal('draw'),
        deck: zDeckType,
    }),
    z.object({
        type: z.literal('bellRing'),
    }),
    z.object({
        type: z.literal('hammer'),
        lane: z.number(),
    }),
    z.object({
        type: z.literal('play'),
        card: z.number(),
        lane: z.number(),
        sacs: z.array(z.number()).optional(),
    }),
    z.object({
        type: z.literal('activate'),
        lane: z.number(),
        sigil: z.string(),
    }),
    z.object({
        type: z.literal('snuff'),
    }),
]) satisfies z.ZodType<Action>;

export const zActionRes = z.union([
    z.object({
        type: z.literal('snipe'),
        lane: z.number(),
        // side 仅 Latch 系列使用（目标可在任意方）；sniper 不传 side
        side: zFightSide.optional(),
    }),
    z.object({
        type: z.literal('chooseDraw'),
        idx: z.number(),
    }),
]) satisfies z.ZodType<ActionRes>;

export const zPlayerMessage = z.union([z.object({
    type: z.literal('action'),
    action: zAction,
}), z.object({
    type: z.literal('response'),
    res: zActionRes,
})]) satisfies z.ZodType<PlayerMessage>;

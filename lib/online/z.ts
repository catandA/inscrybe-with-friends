import { z } from 'zod';
import { FightFeatures, FightOptions, FightSide } from '../engine/Fight';
import { DeckCards, DeckType } from '../engine/Deck';
import { Action, ActionRes, PlayerMessage } from '../engine/Actions';
// 用 import type 避免引入运行时循环依赖（Card.ts → buffs.ts → prints.ts → sigils.ts → Card.ts）。
// sigil 引用合法性校验在 getMergedRuleset 的 validateRuleset 中运行时做，不在 Zod schema 中做。
import type { UserRulesetData } from '../engine/Card';
import { rulesets, isUserRulesetKey } from '../defs/prints';
// 运行时导入 sigilInfos 用于 Zod superRefine 校验（sigils.ts 不反向依赖 z.ts，无循环）。
import { sigilInfos } from '../defs/sigils';

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
    // ruleset 校验加固（避坑 #14）：内置 id 在 Zod 阶段拦截；
    // 用户 ruleset 用 `user:UUID` synthetic key，实际校验在 game.ts start handler 中做。
    ruleset: z.string().refine(id => id in rulesets || isUserRulesetKey(id), { message: 'Unknown ruleset id' }),
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

// ===== Phase 3 UGC: 用户自定义规则集 Zod schema =====

const zCost = z.union([
    z.object({ type: z.literal('blood'), amount: z.number() }),
    z.object({ type: z.literal('bone'), amount: z.number() }),
    z.object({ type: z.literal('energy'), amount: z.number() }),
    z.object({ type: z.literal('mox'), needs: z.number() }),
]);

const zTribe = z.enum(['ant', 'insect', 'canine', 'avian', 'hooved', 'reptile', 'rodent', 'mox', 'bell', 'tentacle']);
const zSpecialStat = z.enum(['ants', 'hand', 'bells', 'moxes', 'mirror']);
const zScrybe = z.enum(['nature', 'tech', 'undead', 'wizard']);

/**
 * CardPrint 的 partial 版本，用于用户 ruleset 的 prints 覆盖。
 * 对齐 lib/engine/Card.ts 的 CardPrint 接口（所有字段 optional）。
 * 对已有 print 的覆盖只传部分字段即可；新增 print 的 name/health/power 必要性
 * 由 getMergedRuleset 的 validateRuleset 在运行时保证。
 */
const zCardPrintPartial = z.object({
    name: z.string().max(64).optional(),
    desc: z.string().max(512).optional(),
    portrait: z.string().max(128).optional(),
    face: z.enum(['rare', 'terrain', 'rare_terrain', 'common']).optional(),
    frame: z.enum(['nature_frame', 'tech_frame', 'undead_frame', 'wizard_frame']).optional(),
    fused: z.boolean().optional(),
    banned: z.boolean().optional(),
    rare: z.boolean().optional(),
    scrybe: zScrybe.optional(),
    health: z.number().int().min(0).max(99).optional(),
    power: z.union([z.number().int().min(0).max(99), zSpecialStat]).optional(),
    cost: zCost.optional(),
    conduit: z.boolean().optional(),
    noSac: z.boolean().optional(),
    tribes: z.array(zTribe).optional(),
    noHammer: z.boolean().optional(),
    song: z.string().max(256).optional(),
    sigils: z.array(z.string().max(64)).optional(),
    traits: z.array(z.string().max(64)).optional(),
    evolution: z.string().max(64).optional(),
    leftHalf: z.string().max(64).optional(),
    rightHalf: z.string().max(64).optional(),
});

const zSideDeckDef = z.object({
    name: z.string().max(64),
    repeat: z.tuple([z.number().int().min(0).max(99), z.string().max(64)]).optional(),
    singleCat: z.record(z.string().max(64), z.tuple([z.number().int().min(0).max(99), z.string().max(64)])).optional(),
    draft: z.object({ cards: z.array(z.string().max(64)), count: z.number().int().min(0).max(99) }).optional(),
});

/**
 * 用户 ruleset 的 FightOptions 覆盖（不含 ruleset 字段，ruleset 由 baseRuleset 强制决定）。
 */
const zUserFightOptions = zFightOptions.omit({ ruleset: true }).partial();

/**
 * Phase 3 UGC：UserRulesetData 的 Zod schema。
 * 校验：
 * - baseRuleset 必须是内置 ruleset id（refine）
 * - options.ruleset 不接受（omit 已移除）
 * - prints 中 sigils 引用必须存在于 SIGIL_INFOS（refine）
 * - sigilParams 的 sigil id 必须存在于 SIGIL_INFOS（refine）
 *
 * 注意：printId 引用的合法性（evolution/sideDeck/sigilParams 引用的 print 必须存在于合并后的 prints）
 * 无法在此处校验（需要合并后才能判断），在 getMergedRuleset 的 validateRuleset 中校验。
 */
export const zUserRulesetData = z.object({
    options: zUserFightOptions.optional(),
    prints: z.record(z.string().max(64), zCardPrintPartial).optional(),
    sideDecks: z.record(z.string().max(64), zSideDeckDef).optional(),
    sigilParams: z.record(z.string().max(64), z.array(z.union([z.string(), z.number()]))).optional(),
}).superRefine((data, ctx) => {
    // 校验 prints 中 sigils 引用合法
    if (data.prints) {
        for (const [printId, print] of Object.entries(data.prints)) {
            if (print.sigils) {
                for (const sigil of print.sigils) {
                    if (!sigilInfos[sigil]) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `Print ${printId} references unknown sigil ${sigil}`,
                            path: ['prints', printId, 'sigils'],
                        });
                    }
                }
            }
        }
    }
    // 校验 sigilParams 的 sigil id 合法
    if (data.sigilParams) {
        for (const sigil of Object.keys(data.sigilParams)) {
            if (!sigilInfos[sigil]) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `sigilParams references unknown sigil ${sigil}`,
                    path: ['sigilParams', sigil],
                });
            }
        }
    }
}) satisfies z.ZodType<UserRulesetData>;

/**
 * Phase 3 UGC：用户 ruleset 的 baseRuleset 字段校验。
 * 必须是内置 ruleset id（如 'imfComp'）。
 */
export const zBaseRuleset = z.string().refine(id => id in rulesets, { message: 'Unknown base ruleset id' });

/**
 * Phase 3 主题系统：用户主题（CSS 变量键值对）。
 */
export const zUserTheme = z.record(z.string(), z.string());

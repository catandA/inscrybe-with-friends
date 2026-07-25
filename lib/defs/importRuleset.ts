/**
 * Phase 3.5：从 Godot ruleset JSON 文件导入为 Web UserRulesetData。
 *
 * 数据源：Godot `RulesetEditor.gd` 的 `JSON.print(CardInfo.all_data, "\t")` 输出，
 * 典型文件如 `reference/rulesets/standard.json`。
 *
 * 字段映射：
 * - 顶层 `hammers_per_turn`/`ant_limit`/`deck_size_min`/`max_commons_main`/`max_commons_side`/
 *   `num_candles`/`variable_attack_nerf`/`allow_snuffing_candles`/`opt_actives`/`starting_bones`/
 *   `starting_energy_max` → `options`（camelCase）
 * - `snuff_card` → `options.snuffCard`（Godot 用卡牌显示名，需反向映射为 printId）
 * - `cards` 数组 → `prints` 对象（key 为 printId，通过 name 反向查找）
 * - `side_decks` 对象 → `sideDecks`（single/single_cat/draft 三种格式）
 * - 卡牌/副牌组中的 sigil 显示名（如 "Touch of Death"）反向映射为 sigilId（如 `deathTouch`）
 * - 参数化变体（如 "Enlarge (3)"）拆为 sigil + sigilParams 条目
 *
 * 注意：
 * - `ruleset`/`description`/`portrait`/`enable_backrow`/`custom_sigils` 等 Godot 专属字段被忽略（记 warning）。
 * - `enable_backrow=true` 时记 warning（Web 暂未支持后排）。
 * - 卡牌 name 无法反向映射时记 warning 并跳过该卡。
 * - sigil 显示名无法映射时记 warning 并跳过该 sigil。
 * - 同一 sigil id 出现多组参数化变体时（如同时有 "Enlarge (3)" 和 "Enlarge (2)"）记 warning，
 *   后出现的覆盖先前的（与 imfComp 单一 sigilParams 设计一致）。
 */
import { Cost, UserRulesetData, SideDeck, Tribe } from '../engine/Card';
import { FightOptions } from '../engine/Fight';
import { MOX_TYPES } from '../engine/constants';
import { rulesets } from './prints';
import { sigilInfos, Sigil } from './sigils';

/** 导入结果。errors 非空时应阻止保存；warnings 可展示给用户。 */
export interface ImportResult {
    data: UserRulesetData;
    warnings: string[];
    errors: string[];
}

/** Godot JSON 中的卡牌对象结构（部分字段）。 */
interface GodotCard {
    name: string;
    sigils?: string[];
    attack: number | string;
    health: number;
    blood_cost?: number;
    bone_cost?: number;
    energy_cost?: number;
    mox_cost?: string[];
    banned?: boolean;
    rare?: boolean;
    nosac?: boolean;
    nohammer?: boolean;
    conduit?: boolean;
    fused?: boolean;
    description?: string;
    evolution?: string;
    atkspecial?: string;
    left_half?: string;
    right_half?: string;
    tribes?: string[];
}

/** Godot JSON 中的 side_decks 条目结构。 */
interface GodotSideDeck {
    type: 'single' | 'single_cat' | 'draft';
    card?: string;
    count?: number;
    /** single_cat 时是对象，draft 时是字符串数组（卡牌显示名）。 */
    cards?: Record<string, { card: string; count: number }> | string[];
}

/** Godot JSON 顶层结构（仅列出导入用到的字段）。 */
interface GodotRuleset {
    ruleset?: string;
    hammers_per_turn?: number;
    ant_limit?: number;
    deck_size_min?: number;
    max_commons_main?: number;
    max_commons_side?: number;
    num_candles?: number;
    variable_attack_nerf?: boolean;
    allow_snuffing_candles?: boolean;
    opt_actives?: boolean;
    enable_backrow?: boolean;
    starting_bones?: number;
    starting_energy_max?: number;
    snuff_card?: string;
    cards?: GodotCard[];
    side_decks?: Record<string, GodotSideDeck>;
    custom_sigils?: unknown;
    description?: string;
    portrait?: string;
}

/**
 * 参数化变体识别规则。
 * key 是基础 sigil 显示名（如 "Enlarge"），value 是解析规则。
 * - extractParams: 从变体后缀提取 sigilParams（返回 null 表示用默认值）
 * - defaultParams: 变体名不带后缀时使用
 *
 * 变体名格式参考 sigil-mapping.md：如 "Enlarge (3)"、"Bonehorn (1)"、"Power Dice (2)"、
 * "Disentomb (Corpses)"、"Detonator (5)"。
 */
interface VariantRule {
    sigilId: Sigil;
    extractParams: (variantSuffix: string) => (string | number)[] | null;
    defaultParams?: (string | number)[];
}

const VARIANT_RULES: Record<string, VariantRule> = {
    Enlarge: {
        sigilId: 'activatedStatsUp',
        extractParams: (suffix) => {
            const m = suffix.match(/\((\d+)\)/);
            if (m) return [Number(m[1]), 1];
            return null;
        },
        defaultParams: [2, 1],
    },
    Stimulate: {
        sigilId: 'activatedStatsUpEnergy',
        extractParams: (suffix) => {
            const m = suffix.match(/\((\d+)\)/);
            if (m) return [Number(m[1]), 1];
            return null;
        },
        defaultParams: [3, 1],
    },
    Bonehorn: {
        sigilId: 'activatedEnergyToBones',
        extractParams: (suffix) => {
            const m = suffix.match(/\((\d+)\)/);
            if (m) return [1, Number(m[1])];
            return null;
        },
        defaultParams: [1, 3],
    },
    'Power Dice': {
        sigilId: 'activatedDiceRollEnergy',
        extractParams: (suffix) => {
            const m = suffix.match(/\((\d+)\)/);
            if (m) return [Number(m[1])];
            return null;
        },
        defaultParams: [1],
    },
    Disentomb: {
        sigilId: 'activatedDrawSkeleton',
        extractParams: (suffix) => {
            if (suffix.includes('Corpses')) return [2, 'witheredCorpse'];
            return null;
        },
        defaultParams: [1, 'skeleton'],
    },
    Detonator: {
        sigilId: 'detonator',
        extractParams: (suffix) => {
            const m = suffix.match(/\((\d+)\)/);
            if (m) return [Number(m[1])];
            return null;
        },
        defaultParams: [5],
    },
};

/**
 * 解析 Godot sigil 显示名，返回 sigilId 与可选的 sigilParams 覆盖。
 *
 * 返回值：
 * - { sigilId } 普通符文
 * - { sigilId, paramOverride } 参数化变体（需写入 sigilParams）
 * - null 无法识别（调用方记 warning）
 */
function parseSigilName(
    displayName: string,
    nameToSigilId: Map<string, Sigil>,
): { sigilId: Sigil; paramOverride?: (string | number)[] } | null {
    // 1. 直接命中（含独立变体如 "Fecundity (Kaycee)"、"Energy Gun (Eternal)" 等）
    const direct = nameToSigilId.get(displayName);
    if (direct) return { sigilId: direct };

    // 2. 参数化变体：尝试匹配 "BaseName (Suffix)" 或 "BaseName Suffix"
    for (const [baseName, rule] of Object.entries(VARIANT_RULES)) {
        if (displayName === baseName) {
            return { sigilId: rule.sigilId, paramOverride: rule.defaultParams };
        }
        if (displayName.startsWith(baseName + ' ')) {
            const suffix = displayName.slice(baseName.length + 1);
            const params = rule.extractParams(suffix);
            if (params) return { sigilId: rule.sigilId, paramOverride: params };
        }
    }

    return null;
}

/** Tribe 显示名 → Web Tribe id。 */
const TRIBE_NAMES: Record<string, Tribe> = {
    ant: 'ant',
    insect: 'insect',
    canine: 'canine',
    avian: 'avian',
    hooved: 'hooved',
    reptile: 'reptile',
    rodent: 'rodent',
    mox: 'mox',
    bell: 'bell',
    tentacle: 'tentacle',
};

/** 将 Godot cost 字段转为 Web Cost 类型。 */
function parseCost(card: GodotCard): Cost | undefined {
    if (card.blood_cost && card.blood_cost > 0) {
        return { type: 'blood', amount: card.blood_cost };
    }
    if (card.bone_cost && card.bone_cost > 0) {
        return { type: 'bone', amount: card.bone_cost };
    }
    if (card.energy_cost && card.energy_cost > 0) {
        return { type: 'energy', amount: card.energy_cost };
    }
    if (card.mox_cost && card.mox_cost.length > 0) {
        let needs = 0;
        for (const color of card.mox_cost) {
            const mask = MOX_TYPES[color];
            if (mask !== undefined) needs |= mask;
        }
        if (needs !== 0) return { type: 'mox', needs };
    }
    return undefined;
}

/** 特殊攻击类型映射：Godot atkspecial → Web Stat。 */
const ATK_SPECIAL_MAP: Record<string, 'ants' | 'hand' | 'bells' | 'moxes' | 'mirror'> = {
    ant: 'ants',
    ants: 'ants',
    hand: 'hand',
    bell: 'bells',
    bells: 'bells',
    mox: 'moxes',
    moxes: 'moxes',
    green_mox: 'moxes',
    mirror: 'mirror',
};

/**
 * 主导入函数。
 * @param jsonText Godot ruleset JSON 文本
 * @param baseRulesetId 内置 ruleset id（如 'imfComp'），用于 name → printId 反向查找
 * @returns ImportResult，包含 data（UserRulesetData）、warnings、errors
 */
export function importRulesetFromGodotJSON(
    jsonText: string,
    baseRulesetId: string,
): ImportResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const data: UserRulesetData = {};

    const base = rulesets[baseRulesetId];
    if (!base) {
        errors.push(`Unknown base ruleset: ${baseRulesetId}`);
        return { data, warnings, errors };
    }

    let parsed: GodotRuleset;
    try {
        parsed = JSON.parse(jsonText) as GodotRuleset;
    } catch (e) {
        errors.push(`JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
        return { data, warnings, errors };
    }

    // 构建 name → printId 反向映射
    const nameToPrintId = new Map<string, string>();
    for (const [printId, print] of Object.entries(base.prints)) {
        nameToPrintId.set(print.name, printId);
    }

    // 构建 sigil displayName → sigilId 反向映射
    const nameToSigilId = new Map<string, Sigil>();
    for (const [sigilId, info] of Object.entries(sigilInfos) as [Sigil, { name: string }][]) {
        nameToSigilId.set(info.name, sigilId);
    }

    // ===== 1. 处理顶层 FightOptions =====
    const options: Partial<Omit<FightOptions, 'ruleset'>> = {};
    if (parsed.hammers_per_turn !== undefined) options.hammersPerTurn = parsed.hammers_per_turn;
    if (parsed.ant_limit !== undefined) options.antLimit = parsed.ant_limit;
    if (parsed.deck_size_min !== undefined) options.deckSizeMin = parsed.deck_size_min;
    if (parsed.max_commons_main !== undefined) options.maxCommonsMain = parsed.max_commons_main;
    if (parsed.max_commons_side !== undefined) options.maxCommonsSide = parsed.max_commons_side;
    if (parsed.num_candles !== undefined) options.numCandles = parsed.num_candles;
    if (parsed.variable_attack_nerf !== undefined) options.variableAttackNerf = parsed.variable_attack_nerf;
    if (parsed.allow_snuffing_candles !== undefined) options.allowSnuffingCandles = parsed.allow_snuffing_candles;
    if (parsed.opt_actives !== undefined) options.optActives = parsed.opt_actives;
    if (parsed.starting_bones !== undefined) options.startingBones = parsed.starting_bones;
    if (parsed.starting_energy_max !== undefined) options.maxEnergy = parsed.starting_energy_max;

    if (parsed.snuff_card !== undefined) {
        const snuffPrintId = nameToPrintId.get(parsed.snuff_card);
        if (snuffPrintId) {
            options.snuffCard = snuffPrintId;
        } else {
            warnings.push(`snuff_card "${parsed.snuff_card}" 无法映射到 printId，保留默认值`);
        }
    }

    if (Object.keys(options).length > 0) data.options = options;

    // ===== 2. 处理 cards → prints =====
    const prints: UserRulesetData['prints'] = {};
    const sigilParams: Record<string, (string | number)[]> = {};

    if (parsed.cards && Array.isArray(parsed.cards)) {
        for (const godotCard of parsed.cards) {
            const printId = nameToPrintId.get(godotCard.name);
            if (!printId) {
                warnings.push(`卡牌 "${godotCard.name}" 无法映射到 printId，跳过`);
                continue;
            }

            // 转换 sigil 显示名 → sigilId
            const sigilIds: string[] = [];
            if (godotCard.sigils) {
                for (const sigilName of godotCard.sigils) {
                    const sigilParsed = parseSigilName(sigilName, nameToSigilId);
                    if (!sigilParsed) {
                        warnings.push(`卡牌 "${godotCard.name}" 的符文 "${sigilName}" 无法识别，跳过该符文`);
                        continue;
                    }
                    sigilIds.push(sigilParsed.sigilId);
                    if (sigilParsed.paramOverride) {
                        const existing = sigilParams[sigilParsed.sigilId];
                        if (existing && JSON.stringify(existing) !== JSON.stringify(sigilParsed.paramOverride)) {
                            warnings.push(
                                `符文 "${sigilName}" 的参数 ${JSON.stringify(sigilParsed.paramOverride)} 与既有 ${JSON.stringify(existing)} 冲突，后者覆盖前者`,
                            );
                        }
                        sigilParams[sigilParsed.sigilId] = sigilParsed.paramOverride;
                    }
                }
            }

            const cost = parseCost(godotCard);

            // 转换 attack → power
            let power: number | string;
            if (godotCard.atkspecial && ATK_SPECIAL_MAP[godotCard.atkspecial]) {
                power = ATK_SPECIAL_MAP[godotCard.atkspecial];
            } else if (typeof godotCard.attack === 'string') {
                const mapped = ATK_SPECIAL_MAP[godotCard.attack];
                power = mapped ?? godotCard.attack;
            } else {
                power = godotCard.attack;
            }

            const tribes = godotCard.tribes?.map(t => TRIBE_NAMES[t]).filter(Boolean) as Tribe[] | undefined;

            let evolution: string | undefined;
            if (godotCard.evolution) {
                evolution = nameToPrintId.get(godotCard.evolution);
                if (!evolution) {
                    warnings.push(`卡牌 "${godotCard.name}" 的 evolution "${godotCard.evolution}" 无法映射，跳过该字段`);
                }
            }

            let leftHalf: string | undefined;
            let rightHalf: string | undefined;
            if (godotCard.left_half) {
                leftHalf = nameToPrintId.get(godotCard.left_half);
                if (!leftHalf) warnings.push(`卡牌 "${godotCard.name}" 的 left_half "${godotCard.left_half}" 无法映射`);
            }
            if (godotCard.right_half) {
                rightHalf = nameToPrintId.get(godotCard.right_half);
                if (!rightHalf) warnings.push(`卡牌 "${godotCard.name}" 的 right_half "${godotCard.right_half}" 无法映射`);
            }

            const printOverride: NonNullable<UserRulesetData['prints']>[string] = {
                name: godotCard.name,
                health: godotCard.health,
                power: power as number | 'ants' | 'hand' | 'bells' | 'moxes' | 'mirror',
            };
            if (cost !== undefined) printOverride.cost = cost;
            if (godotCard.banned !== undefined) printOverride.banned = godotCard.banned;
            if (godotCard.rare !== undefined) printOverride.rare = godotCard.rare;
            if (godotCard.nosac !== undefined) printOverride.noSac = godotCard.nosac;
            if (godotCard.nohammer !== undefined) printOverride.noHammer = godotCard.nohammer;
            if (godotCard.conduit !== undefined) printOverride.conduit = godotCard.conduit;
            if (godotCard.fused !== undefined) printOverride.fused = godotCard.fused;
            if (godotCard.description !== undefined) printOverride.desc = godotCard.description;
            if (sigilIds.length > 0) printOverride.sigils = sigilIds;
            if (tribes && tribes.length > 0) printOverride.tribes = tribes;
            if (evolution !== undefined) printOverride.evolution = evolution;
            if (leftHalf !== undefined) printOverride.leftHalf = leftHalf;
            if (rightHalf !== undefined) printOverride.rightHalf = rightHalf;

            prints[printId] = printOverride;
        }
    }

    if (Object.keys(prints).length > 0) data.prints = prints;
    if (Object.keys(sigilParams).length > 0) data.sigilParams = sigilParams;

    // ===== 3. 处理 side_decks =====
    const sideDecks: Record<string, SideDeck> = {};
    if (parsed.side_decks) {
        for (const [sideDeckName, godotSideDeck] of Object.entries(parsed.side_decks)) {
            const converted = convertSideDeck(sideDeckName, godotSideDeck, nameToPrintId, warnings);
            if (converted) {
                sideDecks[sideDeckName] = converted;
            }
        }
    }
    if (Object.keys(sideDecks).length > 0) data.sideDecks = sideDecks;

    // ===== 4. 忽略的字段 → warnings =====
    if (parsed.ruleset !== undefined) {
        warnings.push(`Godot "ruleset" 字段 "${parsed.ruleset}" 已忽略（Web 用 ruleset name 字段）`);
    }
    if (parsed.enable_backrow) {
        warnings.push('Godot "enable_backrow=true" 已忽略（Web 暂未支持后排机制）');
    }
    if (parsed.custom_sigils) {
        warnings.push('Godot "custom_sigils" 已忽略（Web 不支持自定义符文 DSL）');
    }
    if (parsed.portrait) {
        warnings.push('Godot 顶层 "portrait" 字段已忽略（Web 用卡牌级 portrait）');
    }

    return { data, warnings, errors };
}

/** 转换单个 Godot side_deck 为 Web SideDeck。 */
function convertSideDeck(
    name: string,
    godotSideDeck: GodotSideDeck,
    nameToPrintId: Map<string, string>,
    warnings: string[],
): SideDeck | null {
    const sideDeck: SideDeck = { name };

    if (godotSideDeck.type === 'single') {
        if (!godotSideDeck.card || godotSideDeck.count === undefined) {
            warnings.push(`副牌组 "${name}" 缺少 card/count 字段，跳过`);
            return null;
        }
        const printId = nameToPrintId.get(godotSideDeck.card);
        if (!printId) {
            warnings.push(`副牌组 "${name}" 的 card "${godotSideDeck.card}" 无法映射，跳过`);
            return null;
        }
        sideDeck.repeat = [godotSideDeck.count, printId];
    } else if (godotSideDeck.type === 'single_cat') {
        if (!godotSideDeck.cards) {
            warnings.push(`副牌组 "${name}" 缺少 cards 字段，跳过`);
            return null;
        }
        const singleCat: Record<string, [number, string]> = {};
        for (const [catName, catData] of Object.entries(godotSideDeck.cards)) {
            const printId = nameToPrintId.get(catData.card);
            if (!printId) {
                warnings.push(`副牌组 "${name}" 分类 "${catName}" 的 card "${catData.card}" 无法映射，跳过该分类`);
                continue;
            }
            singleCat[catName] = [catData.count, printId];
        }
        if (Object.keys(singleCat).length === 0) {
            warnings.push(`副牌组 "${name}" 所有分类均无法映射，跳过`);
            return null;
        }
        sideDeck.singleCat = singleCat;
    } else if (godotSideDeck.type === 'draft') {
        if (!godotSideDeck.cards || !Array.isArray(godotSideDeck.cards) || godotSideDeck.count === undefined) {
            warnings.push(`副牌组 "${name}" 缺少 cards/count 字段，跳过`);
            return null;
        }
        const draftCards: string[] = [];
        for (const cardName of godotSideDeck.cards) {
            const printId = nameToPrintId.get(cardName);
            if (!printId) {
                warnings.push(`副牌组 "${name}" draft 的 card "${cardName}" 无法映射，跳过`);
                continue;
            }
            draftCards.push(printId);
        }
        if (draftCards.length === 0) {
            warnings.push(`副牌组 "${name}" draft 所有卡牌均无法映射，跳过`);
            return null;
        }
        sideDeck.draft = { cards: draftCards, count: godotSideDeck.count };
    } else {
        warnings.push(`副牌组 "${name}" 的未知 type "${godotSideDeck.type}"，跳过`);
        return null;
    }

    return sideDeck;
}

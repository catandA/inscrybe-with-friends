/**
 * 符文行为测试工具：用 handleEvents 直接推送事件，绕过 handleAction 的费用/校验逻辑，
 * 聚焦符文效果本身。适合做行为快照（事件序列 + 状态断言）。
 *
 * 不调用 startGame、不洗牌、不从牌库抽牌——setup 直接构造场面，
 * 触发事件由调用方显式给出，保证完全确定。
 */
import { createFightHost, createTick } from '@/lib/engine/Host';
import { handleAction, handleEvents, handleResponse, FightPacket, FightTick } from '@/lib/engine/Tick';
import { Action, ActionRes } from '@/lib/engine/Actions';
import { Event } from '@/lib/engine/Events';
import { Fight, FightSide, Phase } from '@/lib/engine/Fight';
import { Rng } from '@/lib/engine/Rng';
import { makeMinimalFight } from '@/lib/engine/__testutils__/fight';

export interface RunOpts {
    /** 初始 turn。默认 { side: 'player', phase: 'play' }。 */
    turn?: { side: FightSide; phase: Phase };
    /** RNG 种子，默认固定值以保证可复现。 */
    seed?: string;
    /**
     * 在 host 创建后、事件处理前调用，用于设置 host.decks 等 fight 之外的状态。
     * fight.decks[side][type] 是 printId 数组（string[]），host.decks[side][type] 是索引数组（number[]）。
     * 简单场景下可用 fillDeck 工具一次性填两侧 deck。
     */
    setupHost?: (fight: Fight<FightSide>, host: { decks: Record<FightSide, { main: number[]; side: number[] }> }) => void;
}

/**
 * 工具：给 host.decks 和 fight.decks 同步填充 N 张 printId。
 * fight.decks 存 printId 字符串，host.decks 存索引数字。
 */
export function fillDeck(
    fight: Fight<FightSide>,
    host: { decks: Record<FightSide, { main: number[]; side: number[] }> },
    side: FightSide,
    type: 'main' | 'side',
    printIds: string[],
) {
    fight.decks[side][type] = [...printIds];
    host.decks[side][type] = printIds.map((_, i) => i);
}

export interface RunResult {
    fight: Fight<FightSide>;
    packet: FightPacket;
}

/**
 * @param setup  在 fight 上放置卡牌、设置状态等
 * @param events 要推送并结算的事件序列
 * @param opts   turn / seed
 */
export async function runEvents(
    setup: (fight: Fight<FightSide>) => void,
    events: Event[],
    opts: RunOpts = {},
): Promise<RunResult> {
    const fight = makeMinimalFight();
    fight.turn = opts.turn ?? { side: 'player', phase: 'play' };
    setup(fight);
    const host = createFightHost(fight, opts.seed ?? 'sigil-test-seed');
    opts.setupHost?.(fight, host);
    const tick = createTick(host, {
        rng: Rng.resume(host.rngState),
        // 这些测试不走 startGame，initDeck 永不被调用；给个空实现满足类型。
        adapter: { async initDeck() { return [] as number[]; } },
    });
    const packet = await handleEvents(tick, events);
    return { fight: tick.fight, packet };
}

/**
 * 用 handleAction 推送一个动作并结算。
 * 适合测试 handleAction 中的校验逻辑（如 noHammer、cost 校验）。
 */
export async function runAction(
    setup: (fight: Fight<FightSide>) => void,
    side: FightSide,
    action: Action,
    opts: RunOpts = {},
): Promise<RunResult> {
    const fight = makeMinimalFight();
    fight.turn = opts.turn ?? { side: 'player', phase: 'play' };
    setup(fight);
    const host = createFightHost(fight, opts.seed ?? 'sigil-test-seed');
    opts.setupHost?.(fight, host);
    const tick = createTick(host, {
        rng: Rng.resume(host.rngState),
        adapter: { async initDeck() { return [] as number[]; } },
    });
    const packet = await handleAction(tick, side, action);
    return { fight: tick.fight, packet };
}

/** 从 settled 中取指定类型的第一个事件（已类型收窄）。 */
export function firstEvent<T extends Event['type']>(
    packet: FightPacket,
    type: T,
): Extract<Event, { type: T }> {
    const found = packet.settled.find(e => e.type === type);
    if (!found) throw new Error(`Expected event of type ${type}, but settled events were: ${packet.settled.map(e => e.type).join(', ')}`);
    return found as Extract<Event, { type: T }>;
}

/**
 * 推送事件并处理一次 request/response 往返（用于 Latch/Sniper 等需玩家选择的符文）。
 *
 * 流程：
 * 1. handleEvents 推送初始事件 → 若触发 request，host.waitingFor 被设置
 * 2. 若提供了 response 且 host.waitingFor 已设置，调用 handleResponse 完成选择
 * 3. 合并两次的 settled 事件返回
 *
 * @param setup    在 fight 上放置卡牌、设置状态等
 * @param events   要推送并结算的事件序列
 * @param response 玩家选择（side + res）；为 null 时仅推送事件不响应
 * @param opts     turn / seed
 */
export async function runEventsAndRespond(
    setup: (fight: Fight<FightSide>) => void,
    events: Event[],
    response: { side: FightSide; res: ActionRes } | null,
    opts: RunOpts = {},
): Promise<RunResult & { tick: FightTick }> {
    const fight = makeMinimalFight();
    fight.turn = opts.turn ?? { side: 'player', phase: 'play' };
    setup(fight);
    const host = createFightHost(fight, opts.seed ?? 'sigil-test-seed');
    opts.setupHost?.(fight, host);
    const tick = createTick(host, {
        rng: Rng.resume(host.rngState),
        adapter: { async initDeck() { return [] as number[]; } },
    });
    const packet1 = await handleEvents(tick, events);

    let packet2: FightPacket = { settled: [] };
    if (response && host.waitingFor) {
        packet2 = await handleResponse(tick, response.side, response.res);
    }

    return {
        fight: tick.fight,
        packet: { settled: [...packet1.settled, ...packet2.settled] },
        tick,
    };
}

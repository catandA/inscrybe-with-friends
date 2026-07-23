import { DeckType, ShuffledDecks } from '../engine/Deck';
import { FIGHT_SIDES, Fight, FightSide } from '../engine/Fight';
import { ActionReq } from './Actions';
import { Sigil } from '../defs/sigils';
import { Event } from './Events';
import { FightTick } from './Tick';
import { Rng } from './Rng';
import { fromEntries } from '../utils';

export interface FightHost {
    fight: Fight<FightSide>;
    decks: Record<FightSide, ShuffledDecks>;
    backlog: Event[];
    /**
     * 服务端统一 RNG 种子（不可变）。
     * 游戏开始时生成，写入 Game 行供 Phase 4 回放复现。
     * 不放入 Fight，避免经 translateFight 泄露给客户端。
     */
    seed: string;
    /**
     * Rng 内部状态（可变，每次 tick 后由 getPacket 自动写回）。
     * FightHost 经 kv.setHost 序列化到 Redis 时，Rng 实例会丢失；
     * 下次 newTick 时用 Rng.resume(host.rngState) 重建进度。
     */
    rngState: number;
    waitingFor: {
        side: FightSide;
        req: ActionReq;
        sigil: Sigil;
        event: Event;
    } | null;
}

/**
 * 创建 FightHost。
 * @param fight 战斗状态
 * @param seed  可选 RNG 种子。未提供时内部生成（用于本地 playtest 等无需回放的场景）。
 *              线上对局应显式传入（如 randomUUID()）并持久化到 Game.seed。
 */
export function createFightHost(fight: Fight<FightSide>, seed?: string): FightHost {
    const actualSeed = seed ?? generateSeed();
    const rng = new Rng(actualSeed);
    return {
        fight,
        seed: actualSeed,
        rngState: rng.snapshot,
        decks: fromEntries(FIGHT_SIDES.map(side => [side, {
            main: [],
            side: [],
        }])),
        backlog: [],
        waitingFor: null,
    };
}

/**
 * 兜底种子生成（仅用于 createFightHost 未传 seed 时）。
 * 注意：这是种子生成（根熵源），不是游戏内随机点，用 Math.random 取熵是合理的；
 * 游戏内所有随机点必须走 tick.rng。
 */
function generateSeed(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export interface FightAdapter {
    initDeck(this: FightTick, side: FightSide, deck: DeckType): Promise<number[]>;
}

export type TickOpts = Pick<FightTick, 'adapter' | 'logger' | 'rng'>;

export function createTick(host: FightHost, opts: TickOpts): FightTick {
    return {
        fight: host.fight,
        host,
        settled: [],
        queue: [],
        ...opts,
    };
}

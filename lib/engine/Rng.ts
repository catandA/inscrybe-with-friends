/**
 * 基于 mulberry32 的可序列化 PRNG。
 *
 * 为什么不用已有的 `seed-random`（lib/utils.ts）：
 *   `seed-random` 返回的函数不暴露内部状态，`FightHost` 经 `kv.setHost`
 *   序列化到 Redis 后无法恢复 RNG 进度——下一次 `kv.getHost` 拿回的 host
 *   会从 seed 重新开始，重复生成相同的随机数，破坏对局确定性。
 *   mulberry32 的状态是单个 uint32，可直接 JSON 序列化、可恢复。
 *
 * 引擎层所有随机点（洗牌、Power Dice、触手变身、side deck 生成）必须走
 * `tick.rng`，禁止直接用 `Math.random()`。客户端 UI 随机不受此约束。
 */
export class Rng {
    /** mulberry32 内部状态（uint32）。可序列化、可恢复。 */
    private state: number;

    /** 从 seed 构造（会经 FNV-1a 哈希为 uint32）。 */
    constructor(seed: string | number) {
        this.state = hashToUint32(seed);
    }

    /** 从已保存的 state 恢复（用于 FightHost 反序列化后重建 RNG 进度，跳过哈希）。 */
    static resume(state: number): Rng {
        const rng = new Rng(0);
        rng.state = state >>> 0;
        return rng;
    }

    /** 下一个 [0, 1) 浮点数。 */
    next(): number {
        let t = (this.state += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** [0, maxExclusive) 整数。 */
    int(maxExclusive: number): number {
        return Math.floor(this.next() * maxExclusive);
    }

    /** [min, max] 闭区间整数（含两端）。 */
    intInclusive(min: number, max: number): number {
        if (max < min) throw new Error(`intInclusive: max (${max}) < min (${min})`);
        return min + this.int(max - min + 1);
    }

    /** 从非空列表中随机取一个元素。 */
    pick<T>(list: readonly T[]): T {
        if (list.length === 0) throw new Error('Cannot pick from an empty list');
        return list[this.int(list.length)];
    }

    /** Fisher-Yates 原地洗牌，返回原数组（非拷贝）。 */
    shuffle<T>(list: T[]): T[] {
        for (let i = list.length - 1; i > 0; i--) {
            const j = this.int(i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /** 当前状态快照，用于持久化到 FightHost.rngState。 */
    get snapshot(): number {
        return this.state >>> 0;
    }
}

/**
 * 把字符串/数字 seed 哈希为 uint32（FNV-1a 变体）。
 * 数字直接截断为 uint32；字符串走 FNV-1a 以保证不同字符串尽量分布均匀。
 */
function hashToUint32(seed: string | number): number {
    if (typeof seed === 'number') return seed >>> 0;
    let h = 0x811C9DC5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

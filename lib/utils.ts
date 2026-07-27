import randGen from 'seed-random';

export function assert(value: unknown, issue: string): asserts value {
    if (value) return;

    console.error(issue);
}

export function fromEntries<K extends string | number | symbol, V>(entries: Iterable<readonly [K, V]>) {
    return Object.fromEntries(entries) as Record<K, V>;
}

export function entries<K extends string | number | symbol, V>(obj: { [key in K]?: V }) {
    return Object.entries(obj) as [K, V][];
}

export function assign<T extends object>(obj: T, ...sources: Partial<T>[]): T {
    return Object.assign(obj, ...sources);
}

export function clone<T>(obj: T) {
    return JSON.parse(JSON.stringify(obj)) as T;
}

export function intersperse<T, S>(list: T[], separator: S): (T | S)[] {
    return list.flatMap((item, i) => i > 0 ? [separator, item] : [item]);
}

export function intersperseFn<T, S>(list: T[], separator: (i: number) => S): (T | S)[] {
    return list.flatMap((item, i) => i > 0 ? [separator(i), item] : [item]);
}

export function join<T, J = T>(lists: T[][], joiner: J): (T | J)[] {
    return lists.flatMap((list, i) => i > 0 ? [joiner, ...list] : list);
}

export function random<T>(list: T[]) {
    return list[Math.floor(Math.random() * list.length)];
}

export function* namespacedIndexes<T>(list: T[], namespaceFn: (obj: T) => string) {
    const namespaces = new Map<string, number>();

    for (const obj of list) {
        const namespace = namespaceFn(obj);
        const index = namespaces.get(namespace) ?? 0;

        yield [obj, `${namespace}:${index}`] as const;

        namespaces.set(namespace, index + 1);
    }
}

export function includes<const T>(list: T[], item: unknown): item is T {
    return list.indexOf(item as T) !== -1;
}

export function shuffle<T>(list: T[], seed?: string) {
    const rand = seed == null ? randGen() : randGen(seed);

    if (list.constructor !== Array) throw new Error('Input is not an array');
    let i = list.length;

    while (0 !== i) {
        var j = Math.floor(rand() * (i--));

        var temp = list[i];
        list[i] = list[j];
        list[j] = temp;
    }
    return list;
}

// Next Stuff

export const isClient = typeof window === 'object';

/**
 * 生成 RFC 4122 v4 UUID。
 *
 * `crypto.randomUUID()` 是 Web Crypto API，只在 secure context（HTTPS 或 localhost）
 * 下可用。生产 build 通过 HTTP + 公网 IP 访问时该函数不存在，调用会抛
 * `TypeError: crypto.randomUUID is not a function`。
 * 这里优先用 randomUUID，缺失时降级到 `crypto.getRandomValues` 手写 v4，
 * 最终降级到 Math.random（极不可能走到，仅作保底）。
 */
export function uuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function getBaseUrl() {
    if (isClient)
        return '';
    if (process.env.VERCEL_URL)
        return `https://${process.env.VERCEL_URL}`;
    return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

// DOM Stuff

const COLOR_COMPUTE = '--color-compute';
export function getComputedColor(target: HTMLElement, cssColor: string) {
    target.style.setProperty(COLOR_COMPUTE, cssColor);
    const computedColor = getComputedStyle(target).getPropertyValue(COLOR_COMPUTE);
    target.style.removeProperty(COLOR_COMPUTE);

    return computedColor;
}

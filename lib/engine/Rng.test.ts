import { describe, it, expect } from 'vitest';
import { Rng } from './Rng';

describe('Rng', () => {
    describe('确定性', () => {
        it('相同字符串 seed 产生相同序列', () => {
            const a = new Rng('test-seed');
            const b = new Rng('test-seed');
            const seqA = Array.from({ length: 10 }, () => a.next());
            const seqB = Array.from({ length: 10 }, () => b.next());
            expect(seqA).toEqual(seqB);
        });

        it('不同 seed 产生不同序列', () => {
            const a = new Rng('seed-a');
            const b = new Rng('seed-b');
            const seqA = Array.from({ length: 10 }, () => a.next());
            const seqB = Array.from({ length: 10 }, () => b.next());
            expect(seqA).not.toEqual(seqB);
        });

        it('数字 seed 与字符串 seed 都被接受', () => {
            const a = new Rng(42);
            const b = new Rng(42);
            expect(a.next()).toBe(b.next());
        });

        it('next() 返回值落在 [0, 1)', () => {
            const rng = new Rng('range-test');
            for (let i = 0; i < 1000; i++) {
                const v = rng.next();
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThan(1);
            }
        });
    });

    describe('resume', () => {
        it('resume 后的序列等于原 Rng 在该状态之后的序列', () => {
            const rng = new Rng('resume-test');
            // 先消耗 5 个值
            for (let i = 0; i < 5; i++) rng.next();
            const snapshot = rng.snapshot;
            const continued = Array.from({ length: 5 }, () => rng.next());

            const resumed = Rng.resume(snapshot);
            const resumedSeq = Array.from({ length: 5 }, () => resumed.next());

            expect(resumedSeq).toEqual(continued);
        });

        it('snapshot 是 uint32', () => {
            const rng = new Rng('uint-test');
            for (let i = 0; i < 10; i++) rng.next();
            const snap = rng.snapshot;
            expect(Number.isInteger(snap)).toBe(true);
            expect(snap).toBeGreaterThanOrEqual(0);
            expect(snap).toBeLessThanOrEqual(0xFFFFFFFF);
        });
    });

    describe('int / intInclusive', () => {
        it('int(6) 落在 [0, 5]', () => {
            const rng = new Rng('int-test');
            for (let i = 0; i < 1000; i++) {
                const v = rng.int(6);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(5);
                expect(Number.isInteger(v)).toBe(true);
            }
        });

        it('intInclusive(1, 6) 落在 [1, 6]（Power Dice 场景）', () => {
            const rng = new Rng('dice-test');
            const seen = new Set<number>();
            for (let i = 0; i < 1000; i++) {
                const v = rng.intInclusive(1, 6);
                expect(v).toBeGreaterThanOrEqual(1);
                expect(v).toBeLessThanOrEqual(6);
                seen.add(v);
            }
            // 1000 次掷骰应覆盖全部 6 面（极低概率不覆盖，可接受）
            expect(seen.size).toBe(6);
        });

        it('intInclusive 反转区间报错', () => {
            const rng = new Rng('err-test');
            expect(() => rng.intInclusive(5, 3)).toThrow();
        });
    });

    describe('pick', () => {
        it('返回列表中的元素', () => {
            const list = ['a', 'b', 'c', 'd', 'e'];
            const rng = new Rng('pick-test');
            for (let i = 0; i < 100; i++) {
                expect(list).toContain(rng.pick(list));
            }
        });

        it('空列表报错', () => {
            const rng = new Rng('empty-test');
            expect(() => rng.pick([])).toThrow();
        });
    });

    describe('shuffle', () => {
        it('保持长度不变且元素不变（多重集相等）', () => {
            const rng = new Rng('shuffle-test');
            const orig = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const copy = [...orig];
            rng.shuffle(copy);
            expect(copy).toHaveLength(orig.length);
            expect(copy.slice().sort()).toEqual(orig.slice().sort());
        });

        it('相同 seed 产生相同洗牌结果', () => {
            const a = new Rng('shuffle-determinism');
            const b = new Rng('shuffle-determinism');
            const listA = [1, 2, 3, 4, 5, 6, 7, 8];
            const listB = [1, 2, 3, 4, 5, 6, 7, 8];
            a.shuffle(listA);
            b.shuffle(listB);
            expect(listA).toEqual(listB);
        });

        it('空数组与单元素数组不报错', () => {
            const rng = new Rng('edge-test');
            expect(rng.shuffle([])).toEqual([]);
            expect(rng.shuffle([42])).toEqual([42]);
        });
    });
});

/**
 * Phase 3.4：客户端 ruleset 解析 hook。
 *
 * 给定一个 rulesetId（内置 id 或 `user:UUID` synthetic key），返回对应的 Ruleset 对象。
 * 对于用户 ruleset，自动从 DB 拉取数据、合并、注册到运行时 rulesets map。
 *
 * 用法：
 * ```ts
 * const ruleset = useResolvedRuleset(selectedRuleset);
 * // ruleset 可能是 null（加载中）或 Ruleset 对象
 * ```
 */
import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
    rulesets as builtinRulesets,
    getMergedRuleset,
    isUserRulesetKey,
    extractUserRulesetId,
    registerRuleset,
} from '@/lib/defs/prints';
import type { Ruleset } from '@/lib/engine/Card';
import type { UserRulesetData } from '@/lib/engine/Card';

export function useResolvedRuleset(rulesetId: string | null | undefined): Ruleset | null {
    // 内置 ruleset 直接返回
    const isUser = rulesetId ? isUserRulesetKey(rulesetId) : false;
    const userRulesetId = isUser && rulesetId ? extractUserRulesetId(rulesetId) : null;

    const userRulesetQuery = trpc.rulesets.get.useQuery(
        { id: userRulesetId! },
        { enabled: !!userRulesetId, refetchOnWindowFocus: false },
    );

    return useMemo(() => {
        if (!rulesetId) return null;

        // 内置 ruleset
        if (!isUser) {
            return builtinRulesets[rulesetId] ?? null;
        }

        // 用户 ruleset：需要已加载的数据
        if (!userRulesetQuery.data) return null;

        const override = (userRulesetQuery.data.data as UserRulesetData) ?? {};
        const merged = getMergedRuleset(userRulesetQuery.data.baseRuleset, override, userRulesetQuery.data.name);

        // 注册到运行时 map，使 rulesets[syntheticKey] 可用
        registerRuleset(rulesetId, merged);

        return merged;
    }, [rulesetId, isUser, userRulesetQuery.data]);
}

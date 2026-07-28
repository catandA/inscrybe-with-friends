import { RefObject, useEffect, useState } from 'react';

export function useEm<T extends HTMLElement>(target: RefObject<T | null>) {
    const [em, setEm] = useState(0);

    useEffect(() => {
        const el = target.current;
        if (!el) return;

        const update = () => {
            const fontSizePx = parseFloat(getComputedStyle(el).fontSize);
            setEm(fontSizePx / 2);
        };

        update();
        // font-size 基于视口响应式变化（clamp+min+vw/vh），
        // 元素尺寸随视口改变时需重新计算 em 值，否则 Board 的
        // canOpposingHandExceedBoard 判断会失准。
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [target]);

    return em;
}

/**
 * 卡牌与符文的 i18n helper（Phase 5）。
 *
 * 内置卡牌/符文在 zh locale 下返回中文翻译；用户自定义（UGC）或 en locale 时回退到源码 name/desc。
 * 翻译 key 约定：
 *   - 卡牌名称：`cards.<printId>.name`
 *   - 卡牌描述：`cards.<printId>.desc`
 *   - 符文名称：`sigils.<sigilId>.name`
 *   - 符文描述：`sigils.<sigilId>.desc`
 *
 * 用户自定义 ruleset 中覆盖或新增的卡牌：print.name / print.desc 是用户输入的英文名，
 * i18n key 不存在时自动回退，无需特殊处理。
 */
import i18n from '@/lib/i18n';
import type { CardPrint } from '@/lib/engine/Card';
import { sigilInfos, type Sigil } from './sigils';

/**
 * 获取卡牌名称（带 i18n）。
 * 内置卡牌在中文 locale 下返回中文名；用户自定义卡牌或英文 locale 返回 print.name。
 */
export function getCardName(printId: string, print: CardPrint): string {
    return i18n.t(`cards.${printId}.name`, { defaultValue: print.name });
}

/**
 * 获取卡牌描述（带 i18n）。
 * 无描述时返回 undefined；有描述时返回对应语言的翻译。
 */
export function getCardDesc(printId: string, print: CardPrint): string | undefined {
    if (!print.desc) return undefined;
    return i18n.t(`cards.${printId}.desc`, { defaultValue: print.desc });
}

/**
 * 获取符文名称（带 i18n）。
 */
export function getSigilName(sigil: Sigil): string {
    const info = sigilInfos[sigil];
    if (!info) return sigil;
    return i18n.t(`sigils.${sigil}.name`, { defaultValue: info.name });
}

/**
 * 获取符文描述（带 i18n）。
 */
export function getSigilDesc(sigil: Sigil): string {
    const info = sigilInfos[sigil];
    if (!info) return sigil;
    return i18n.t(`sigils.${sigil}.desc`, { defaultValue: info.description });
}

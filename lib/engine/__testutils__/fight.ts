/**
 * 引擎测试公用工厂。
 *
 * 设计原则：
 * - 用 imfComp 规则集的真实 prints，避免与数据脱节；
 * - 但不调用 startGame / 不走洗牌，保证 setup 完全确定、不依赖 RNG；
 * - 提供 placeCard 直接填场，绕过 play 事件链，适合纯函数单测。
 */
import { createFight, FightOptions, Fight, FightSide } from '../Fight';
import { defaultFightOptions } from '@/lib/online/z';
import { initCardFromPrint, Card } from '../Card';
import { rulesets } from '@/lib/defs/prints';
import { DeckCards } from '../Deck';

/** imfComp 规则集的 prints，测试中可直接引用真实卡牌定义。 */
export const PRINTS = rulesets.imfComp.prints;

/**
 * 构造一个最小可用的 Fight（双方各 3 张 adder 作牌库，不洗牌、不发牌）。
 * 牌库内容对纯函数测试无关紧要（这些测试不抽牌），用 adder 仅为合法 printId。
 */
export function makeMinimalFight(opts?: Partial<FightOptions>): Fight<FightSide> {
    const fullOpts = { ...defaultFightOptions(), ...opts };
    const decks: Record<FightSide, DeckCards> = {
        player: { main: ['adder', 'adder', 'adder'], side: [] },
        opposing: { main: ['adder', 'adder', 'adder'], side: [] },
    };
    return createFight(fullOpts, ['player', 'opposing'], decks);
}

/** 把一张由 printId 初始化的卡放到指定位置，返回该卡。 */
export function placeCard(fight: Fight<FightSide>, side: FightSide, lane: number, printId: string): Card {
    const card = initCardFromPrint(PRINTS, printId);
    fight.field[side][lane] = card;
    return card;
}

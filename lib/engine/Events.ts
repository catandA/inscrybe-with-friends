import { pick } from 'lodash';
import { rulesets } from '../defs/prints';
import { Sigil } from '../defs/sigils';
import { ActionReq, ActionRes } from './Actions';
import { Card, CardPos, FieldPos, getCardPower, HandPos } from './Card';
import { FightTick } from './Tick';
import { DeckType } from './Deck';
import { FIGHT_SIDES, Fight, FightSide, Phase } from './Fight';
import { oppositeSide } from './utils';

export type Event<T extends keyof EventMap = keyof EventMap> = T extends keyof EventMap ? (EventMap[T] & { type: T }) : never;

export type PerishCause = 'attack' | 'sac' | 'transient' | 'hammer' | 'death-touch';

type EventMap = {
    phase: { phase: Phase; side?: FightSide };
    energy: { side: FightSide, amount: number; total?: number };
    energySpend: { side: FightSide, amount: number };
    bones: { side: FightSide; amount: number };
    draw: { side: FightSide; card?: Card; source?: DeckType; idx?: number };
    perish: { pos: FieldPos; cause: PerishCause };
    triggerAttack: { pos: FieldPos };
    attack: { from: FieldPos; to: FieldPos; direct?: boolean; damage?: number; negated?: boolean };
    shoot: { from: FieldPos; to: FieldPos; damage: number };
    play: { pos: FieldPos; card: Card; fromHand?: HandPos; transient?: boolean };
    mustPlay: { side: FightSide; card: number };
    transform: { pos: FieldPos; card: Card; };
    move: { from: FieldPos; to: FieldPos; turnAround?: boolean, failed?: boolean };
    push: { from: FieldPos; dx: number, turnAround?: boolean, failed?: boolean };
    heal: { pos: FieldPos; amount: number };
    stats: { pos: FieldPos; power?: number; health?: number; };
    activate: { pos: FieldPos };
    newSigil: { pos: CardPos; sigil: Sigil };
    flip: { pos: FieldPos };
    request: { side: FightSide; req: ActionReq; };
    response: { side: FightSide; req: ActionReq; res: ActionRes; };
    lifeLoss: { side: FightSide };
    points: { side: FightSide; amount: number };
    // Phase 2 吹灭蜡烛（对齐 Godot CardSlots.gd:1116-1147）
    snuffCandle: { side: FightSide };
};

// NOTE: assume the `fight` object is always dirty, clone any objects inside it before making state from it
export const eventSettlers: {
    [T in Event['type']]: (fight: Fight<FightSide>, event: Event<T>) => void;
} = {
    phase(fight, event) {
        fight.turn.phase = event.phase;
        if (event.side) {
            fight.turn.side = event.side;
            fight.players[event.side].turnHammers = 0;
        }
        // damage_stun 重置：pre-turn 阶段切换时重置（对齐 Godot start_turn line 1203）。
        // 同一 combat 内只掉 1 蜡烛，下一回合开始时解除保护。
        if (event.phase === 'pre-turn') fight.damageStun = false;
    },
    energy(fight, event) {
        const { energy } = fight.players[event.side];
        const maxEnergy = fight.opts.maxEnergy;
        energy[0] = Math.min(maxEnergy, energy[0] + event.amount);
        if (event.total) energy[1] = Math.min(maxEnergy, energy[1] + event.total);
        energy[1] = Math.max(energy[1], energy[0]);
    },
    energySpend(fight, event) {
        fight.players[event.side].energy[0] -= event.amount;
    },
    bones(fight, event) {
        fight.players[event.side].bones += event.amount;
    },
    draw(fight, event) {
        if (event.card) fight.hands[event.side].push(event.card);
        fight.players[event.side].handSize++;
    },
    perish(fight, event) {
        const [side, lane] = event.pos;
        if (event.cause === 'hammer') fight.players[event.pos[0]].turnHammers++;
        fight.field[side][lane] = null;
    },
    triggerAttack(fight, event) {},
    attack(fight, event) {
        const { prints } = rulesets[fight.opts.ruleset];
        event.damage ??= getCardPower(prints, fight, event.from)!;
        const [toSide, toLane] = event.to;
        const target = fight.field[toSide][toLane];
        if (event.direct || !target) fight.points[event.from[0]] += event.damage;
        else target.state.health = Math.max(0, target.state.health - event.damage);
    },
    shoot(fight, event) {
        const [toSide, toLane] = event.to;
        const target = fight.field[toSide][toLane];
        if (!target || target.state.flipped) return;
        target.state.health = Math.max(0, target.state.health - event.damage);
    },
    play(fight, event) {
        const [side, lane] = event.pos;
        fight.field[side][lane] = event.card;

        if (event.fromHand) {
            const [side, idx] = event.fromHand;
            fight.hands[side]?.splice(idx, 1);
            fight.players[side].handSize--;
            if (fight.mustPlay[side] === idx) {
                fight.mustPlay[side] = null;
            } else if (fight.mustPlay[side] != null && fight.mustPlay[side]! > idx) {
                fight.mustPlay[side]!--;
            }
        }
    },
    mustPlay(fight, event) {
        fight.mustPlay[event.side] = event.card;
    },
    transform(fight, event) {
        const [side, lane] = event.pos;
        fight.field[side][lane] = event.card;
    },
    move(fight, event) {
        const [fromSide, fromLane] = event.from;
        const [toSide, toLane] = event.to;
        const card = fight.field[fromSide][fromLane]!;
        if (event.turnAround) card.state.backward = !card.state.backward;
        if (event.failed) return;
        fight.field[toSide][toLane] = fight.field[fromSide][fromLane];
        fight.field[fromSide][fromLane] = null;
    },
    push(fight, event) {
        const [fromSide, fromLane] = event.from;
        const lanes = fight.field[fromSide];
        const card = lanes[fromLane]!;
        if (event.turnAround) card.state.backward = !card.state.backward;
        if (event.failed) return;

        // get hole for abs(dx) === 1
        let lane = fromLane;
        for (; lanes[lane]; lane += event.dx);
        // move from hole to pusher
        for (; lane !== fromLane; lane -= event.dx) {
            const nextLane = lane - event.dx;
            [lanes[lane], lanes[nextLane]] = [lanes[nextLane], lanes[lane]];
        }
    },
    heal(fight, event) {
        const [side, lane] = event.pos;
        const card = fight.field[side][lane]!;
        card.state.health += event.amount;
    },
    stats(fight, event) {
        const [side, lane] = event.pos;
        const card = fight.field[side][lane]!;
        if (event.power != null) card.state.power = event.power;
        if (event.health != null) card.state.health = event.health;
    },
    activate(fight, event) {},
    newSigil(fight, event) {
        const [area, [side, idx]] = event.pos;
        const card = area === 'field' ? fight.field[side][idx]! : fight.hands[side][idx];
        card.state.sigils.push(event.sigil);
    },
    flip(fight, event) {
        const [side, lane] = event.pos;
        const card = fight.field[side][lane]!;
        card.state.flipped = !card.state.flipped;
    },
    request(fight, event) {
        fight.waitingFor = pick(event, ['side', 'req']);
    },
    response(fight, event) {
        fight.waitingFor = null;
    },
    lifeLoss(fight, event) {
        fight.players[event.side].deaths++;
        for (const side of FIGHT_SIDES) fight.points[side] = 0;
        // 触发 lifeLoss 后置位 damageStun，当前回合内不再检查 lifeLoss。
        // 对齐 Godot CardFight.gd:1006,1011（inflict_damage 中掉蜡烛后设 damage_stun = true）。
        // pre-turn 阶段切换时由 phase settler 重置。
        fight.damageStun = true;
    },
    points(fight, event) {
        fight.points[event.side] += event.amount;
    },
    snuffCandle(fight, event) {
        // 吹灭蜡烛（对齐 Godot CardSlots.gd:1124-1125）：
        // 自己掉 1 蜡烛 + points 重置 + damageStun 重置（允许本回合继续掉蜡烛）。
        // 与 lifeLoss 不同：lifeLoss 置 damageStun=true（保护本回合不再掉），
        // 吹蜡烛是主动行为，重置 damageStun 允许后续攻击仍可掉蜡烛。
        fight.players[event.side].deaths++;
        for (const side of FIGHT_SIDES) fight.points[side] = 0;
        fight.damageStun = false;
    },
};

export function isEventInvalid({ fight, host }: FightTick, event: Event) {
    const { prints } = rulesets[fight.opts.ruleset];
    switch (event.type) {
        case 'attack': {
            const damage = event.damage ?? getCardPower(prints, fight, event.from);
            // Armored 抵消伤害时设 damage=0 + negated=true；negated 的 attack 允许通过（power=0 的卡仍被拦截）
            if (!damage && !event.negated) return true;
            const [side, lane] = event.from;
            if (!fight.field[side][lane]) return true;
            if (event.from[1] < 0 || event.from[1] >= fight.opts.lanes) return true;
            if (event.to[1] < 0 || event.to[1] >= fight.opts.lanes) return true;
            break;
        }
        case 'shoot': {
            // from 可空：爆炸类符文（Gem Detonator/Detonator）触发时死亡卡已移除，
            // settler 只用 to，from 仅作动画来源用。
            if (!fight.field[event.to[0]][event.to[1]]) return true;
            if (fight.field[event.to[0]][event.to[1]]?.state.health === 0) return true;
            break;
        }
        case 'play': {
            const [side, lane] = event.pos;
            if (fight.field[side][lane] != null) return true;
            break;
        }
        case 'triggerAttack': {
            const [, lane] = event.pos;
            if (lane < 0 || lane >= fight.opts.lanes) return true;
            break;
        }
        case 'draw': {
            if (!event.card) {
                if (!event.source) return true;
                if (host.decks[event.side][event.source].length === 0) return true;
            };
            break;
        }
        case 'energySpend': {
            if (fight.players[event.side].energy[0] < event.amount) return true;
            break;
        }
        case 'push':
        case 'move': {
            const [fromSide, fromLane] = event.from;
            if (fight.field[fromSide][fromLane] == null) return true;
            break;
        }
        case 'newSigil': {
            const [area, [side, idx]] = event.pos;
            const card = area === 'field' ? fight.field[side][idx] : fight.hands[side][idx];
            if (!card) return true;
            break;
        };
        case 'heal':
        case 'flip':
        case 'transform':
        case 'perish': {
            const [side, lane] = event.pos;
            const card = fight.field[side][lane];
            if (!card) return true;
            break;
        }
    }
    return false;
}

export function isEventType<const T>(types: T[], event: Event): event is Extract<Event, { type: T }> {
    return types.includes(event.type as T);
}

export function translateEvent(event: Event, side: FightSide, forClient: false): Event;
export function translateEvent(event: Event, side: FightSide, forClient?: boolean): Event | null;
export function translateEvent(event: Event, side: FightSide, forClient: boolean = true): Event | null {
    const shouldFlip = side === 'opposing';
    // confidential events
    if (forClient) {
        if (event.type === 'draw' && event.side !== side) {
            delete event.source;
            delete event.card;
        } else if (event.type === 'newSigil' && event.pos[0] === 'hand' && event.pos[1][0] !== side) {
            return null;
        } else if (event.type === 'play' && event.fromHand && event.fromHand[0] !== side) {
            event.fromHand[1] = 0; // hide index
        } else if (event.type === 'mustPlay' && event.side !== side) {
            event.card = 0; // hide index
        }
        if ((event.type === 'request' || event.type === 'response') && event.side !== side) {
            if (event.req.type === 'chooseDraw') {
                event.req.choices = [];
            }
        }
        if (event.type === 'response' && event.side !== side) {
            if (event.res.type === 'chooseDraw') {
                event.res.idx = -1;
            }
        }
    }

    // flip FightSides
    if (shouldFlip &&
        isEventType([
            'phase', 'energy', 'energySpend', 'bones',
            'draw', 'request', 'response', 'mustPlay',
            'lifeLoss', 'points', 'snuffCandle',
        ], event)
    && event.side) {
        event.side = oppositeSide(event.side);
    } else if (shouldFlip && event.type === 'play') {
        if (event.fromHand) event.fromHand[0] = oppositeSide(event.fromHand[0]);
        event.pos[0] = oppositeSide(event.pos[0]);
    }
    // flip FieldPos
    if (shouldFlip && isEventType(['perish', 'triggerAttack', 'transform', 'heal', 'activate', 'flip', 'stats'], event)) {
        event.pos[0] = oppositeSide(event.pos[0]);
    } else if (shouldFlip && isEventType(['attack', 'shoot', 'move'], event)) {
        event.from[0] = oppositeSide(event.from[0]);
        event.to[0] = oppositeSide(event.to[0]);
    } else if (shouldFlip && isEventType(['push'], event)) {
        event.from[0] = oppositeSide(event.from[0]);
    }
    return event;
}

/**
 * 中立视角事件翻译（观战模式专用）。
 *
 * 在 `translateEvent(side)` 基础上，额外隐藏当前视角方（player）的手牌信息，
 * 使观战者看不到任何一方的手牌内容。
 *
 * 用途：观战 packet 推送（`triggerSpectatorPacket`）和观战端点 initPacket。
 * 与 `translateEvent` 一样会 in-place 修改 event，调用方需传入 clone。
 *
 * @param side 观战视角方（固定为 'player'，与 spectate 端点一致）
 */
export function translateEventForSpectator(event: Event, side: FightSide = 'player'): Event | null {
    const translated = translateEvent(event, side);
    if (!translated) return null;
    // 隐藏当前视角方（translated 中 side === 'player' 对应原 side）的手牌信息
    if (translated.type === 'draw' && translated.side === 'player') {
        delete translated.source;
        delete translated.card;
    } else if (translated.type === 'newSigil' && translated.pos[0] === 'hand' && translated.pos[1][0] === 'player') {
        return null;
    } else if (translated.type === 'play' && translated.fromHand && translated.fromHand[0] === 'player') {
        translated.fromHand[1] = 0; // hide index
    } else if (translated.type === 'mustPlay' && translated.side === 'player') {
        translated.card = 0; // hide index
    }
    if ((translated.type === 'request' || translated.type === 'response') && translated.side === 'player') {
        if (translated.req.type === 'chooseDraw') {
            translated.req.choices = [];
        }
    }
    if (translated.type === 'response' && translated.side === 'player') {
        if (translated.res.type === 'chooseDraw') {
            translated.res.idx = -1;
        }
    }
    return translated;
}

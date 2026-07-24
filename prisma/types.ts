declare global {
    namespace PrismaJson {
        type DeckCards = import('@/lib/engine/Deck').DeckCards;
        type RulesetData = import('@/lib/engine/Card').UserRulesetData;
        // Phase 4 回放：游戏开始时的 FightOptions 和双方 decks，用于回放重建 fight
        type FightOptions = import('@/lib/engine/Fight').FightOptions;
        type GameDecks = Record<import('@/lib/engine/Fight').FightSide, import('@/lib/engine/Deck').DeckCards>;

        interface ConnectionToken {
            refresh_token: string;
            access_token: string;
            expires_at: number;
            scope: string;
        }

        // Phase 3 主题系统：CSS 变量键值对
        type UserTheme = Record<string, string>;
    }
}

export {};

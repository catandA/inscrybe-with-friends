declare global {
    namespace PrismaJson {
        type DeckCards = import('@/lib/engine/Deck').DeckCards;
        type RulesetData = import('@/lib/engine/Card').UserRulesetData;

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

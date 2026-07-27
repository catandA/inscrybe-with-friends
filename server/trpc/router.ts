import { router } from '@/server/trpc';
import { deckRouter } from './decks';
import { lobbiesRouter } from './lobbies';
import { userRouter } from './users';
import { gameRouter } from './game';
import { rulesetsRouter } from './rulesets';
import { chatRouter } from './chat';

export const trpcRouter = router({
    decks: deckRouter,
    lobbies: lobbiesRouter,
    user: userRouter,
    game: gameRouter,
    rulesets: rulesetsRouter,
    chat: chatRouter,
});

export type AppRouter = typeof trpcRouter;

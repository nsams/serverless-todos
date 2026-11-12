import { useEffect, useState, useSyncExternalStore } from "react";

import { todosModuleId } from "../moduleId";
import { acquireDraftSession, type DraftSession, type DraftSnapshot, releaseDraftSession } from "./draftSession";

const noSubscription = () => () => {};

// The draft of a todo for its form (live editing, draftSession.ts): the session (to edit the draft) and its state, updated when anyone
// changes the draft. onPublishedChange: the published todo changed (published by anyone, or changed elsewhere).
export function useTodoDraft(todoId: string, onPublishedChange: () => void) {
    const [session, setSession] = useState<DraftSession | null>(null);

    useEffect(() => {
        const acquired = acquireDraftSession(todoId, `/api/${todosModuleId}/todos/${encodeURIComponent(todoId)}/draft`);
        setSession(acquired);
        return () => {
            setSession(null);
            releaseDraftSession(todoId);
        };
    }, [todoId]);

    useEffect(() => {
        if (!session) {
            return;
        }
        session.onPublishedChange = onPublishedChange;
        return () => {
            session.onPublishedChange = undefined;
        };
    });

    const snapshot: DraftSnapshot | null = useSyncExternalStore(session?.subscribe ?? noSubscription, () => session?.getSnapshot() ?? null);
    return { session, snapshot };
}

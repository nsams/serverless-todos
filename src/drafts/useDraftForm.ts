import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { errorMessage } from "~/errors";

import type { DraftDefinition, DraftValues } from "./draft";
import { acquireDraftSession, type DraftSession, type DraftSnapshot, releaseDraftSession } from "./draftSession";

type Options = {
    // publishes the draft (the route of serverDraft's publish operation); throws e.g. a ValidationError, shown as `error`
    publish: () => Promise<unknown>;
    // the published entity changed (published by anyone, or changed elsewhere): e.g. reload the module's data
    onPublishedChange?: () => void;
    // the message when publishing fails with an unexpected error
    publishErrorMessage?: string;
};

export type DraftForm<Values extends DraftValues, TextField extends string = string> = {
    // null until connected
    session: DraftSession<Values, TextField> | null;
    snapshot: DraftSnapshot<Values> | null;
    publish: () => Promise<void>;
    publishing: boolean;
    // why publishing failed
    error: string | undefined;
    // discards the draft's changes, for everyone
    discard: () => void;
};

const noSubscription = () => () => {};

// A form on a shared draft (draft.ts): connects to the draft (path: its WebSocket route, serverDraft's connect), its state is updated
// when anyone changes the draft. The form renders the draft's values (snapshot.values) and changes them with session.setValues, text
// fields with DraftTextField (DraftFields.tsx). Publishing waits until the form's changes are synced (the server publishes its draft).
export function useDraftForm<Values extends DraftValues, TextField extends string>(
    definition: DraftDefinition<Values, TextField>,
    path: string,
    options: Options,
): DraftForm<Values, TextField> {
    const [session, setSession] = useState<DraftSession<Values, TextField> | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        const acquired = acquireDraftSession(definition, path);
        setSession(acquired);
        return () => {
            setSession(null);
            releaseDraftSession(path);
        };
    }, [definition, path]);

    const { onPublishedChange, publish, publishErrorMessage } = options;
    useEffect(() => (session && onPublishedChange ? session.onPublishedChange(onPublishedChange) : undefined), [session, onPublishedChange]);

    const snapshot = useSyncExternalStore(session?.subscribe ?? noSubscription, () => session?.getSnapshot() ?? null);

    const publishDraft = useCallback(async () => {
        setPublishing(true);
        setError(undefined);
        try {
            await session?.whenSynced();
            await publish();
        } catch (publishError) {
            // e.g. a ValidationError's message
            setError(errorMessage(publishError, publishErrorMessage ?? "Publishing failed, please try again."));
        } finally {
            setPublishing(false);
        }
    }, [session, publish, publishErrorMessage]);

    const discard = useCallback(() => session?.discard(), [session]);

    return { session, snapshot, publish: publishDraft, publishing, error, discard };
}

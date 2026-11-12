import { FormHelperText, Icon, IconButton, Typography } from "@dextinity/ui";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { type InferResponseType, parseResponse } from "hono/client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router";

import { useChatPage } from "~/chat/useChatPage";
import { PageError, PageErrorBoundary } from "~/client/errors";
import { useInvalidateModule, usePageQuery } from "~/client/queries";
import { useLeavePage } from "~/client/routing";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { useShowError } from "~/components/ErrorSnackbar";
import { IconButtonLink } from "~/components/ui/IconButtonLink";
import layout from "~/components/ui/layout.module.css";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { Tabs } from "~/components/ui/Tabs";
import { Tooltip } from "~/components/ui/Tooltip";
import { useDocumentTitle } from "~/components/useDocumentTitle";
import { NotFoundError } from "~/errors";

import { notesClient } from "../api";
import { notesChatPage } from "../chatPage";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { maxNoteBodyLength, maxNoteTitleLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { noteQuery, notesListsKey, useNotebooks } from "../queries";
import { notebookRoute, noteRoute } from "../routes";
import styles from "./NotePage.module.css";

type Note = InferResponseType<(typeof notesClient.notes)[":id"]["$get"], 200>;

// A note in the editor (see noteRoute). The search params are the state of the notebook's grid (NotebookPage.tsx), kept for the back link.
export default function NotePage() {
    return (
        <PageErrorBoundary Fallback={NotePageError}>
            <NoteLoader />
        </PageErrorBoundary>
    );
}

function NoteLoader() {
    const { notebookId, noteId } = noteRoute.useParams();
    const search = noteRoute.useSearch();
    const { data: note } = usePageQuery(noteQuery, noteId);
    // what the assistant gets to know about the page
    useChatPage(notesChatPage, { notebookId: note.notebookId, noteId: note.id });
    // e.g. moved to another notebook by the assistant: the URL follows the note
    if (note.notebookId !== notebookId) {
        return <Navigate to={noteRoute.href({ notebookId: note.notebookId, noteId }, search)} replace />;
    }
    return (
        <NotePageLayout>
            {/* a fresh editor (draft, save state) per note */}
            <NoteEditor key={note.id} note={note} />
        </NotePageLayout>
    );
}

// e.g. deleted by the assistant while open
function NotePageError({ error }: { error: unknown }) {
    useDocumentTitle();
    if (!(error instanceof NotFoundError)) {
        return <PageError error={error} />;
    }
    return (
        <NotePageLayout>
            <div className={clsx(layout.paper, layout.emptyState)}>
                <Typography className={layout.muted}>This note doesn't exist (anymore).</Typography>
            </div>
        </NotePageLayout>
    );
}

// The note's notebook with the grid state it was left in (the search params)
function useNotebookLink(notebookId: string) {
    return notebookRoute.href({ notebookId }, noteRoute.useSearch());
}

// The back link to the notebook's grid (in the state it was left) above the editor
function NotePageLayout({ children }: { children: ReactNode }) {
    const { notebookId } = noteRoute.useParams();
    const notebookLink = useNotebookLink(notebookId);
    const notebook = useNotebooks().find((item) => item.id === notebookId);
    return (
        <div className={layout.container}>
            <div className={layout.stack}>
                <div className={layout.row}>
                    <Tooltip title="Back to the notebook">
                        <IconButtonLink variant="text" color="secondary" aria-label="Back to the notebook" render={<Link to={notebookLink} />}>
                            <Icon name="arrow-left" />
                        </IconButtonLink>
                    </Tooltip>
                    <Typography className={clsx(layout.muted, layout.noWrap)}>{notebook?.name}</Typography>
                </div>
                {children}
            </div>
        </div>
    );
}

// Changes are saved automatically shortly after typing stops
const autosaveDelay = 1000;

type Values = { title: string; body: string };

function NoteEditor({ note }: { note: Note }) {
    const queryClient = useQueryClient();
    const leavePage = useLeavePage();
    const invalidate = useInvalidateModule(notesModuleId);
    const showError = useShowError();
    const notebookLink = useNotebookLink(note.notebookId);
    useDocumentTitle(note.title);

    // The cached note is replaced by the saved one: the page shows it (e.g. the tab title), and when the note is opened again, the
    // editor starts with it instead of the outdated one
    const updateCachedNote = (updated: Note) => queryClient.setQueryData(noteQuery(note.id).queryKey, updated);

    const [draft, setDraft] = useState<Values>({ title: note.title, body: note.body });
    // the stored state the draft is based on; updatedAt tells newer changes made elsewhere from outdated or own ones
    const [saved, setSaved] = useState<Values & { updatedAt: number }>({ title: note.title, body: note.body, updatedAt: Date.parse(note.updatedAt) });
    const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
    const [mode, setMode] = useState<"write" | "preview">(note.body ? "preview" : "write");

    // an empty title isn't saved (a note needs a title)
    const pending: Values = { title: draft.title.trim() || saved.title, body: draft.body };
    const dirty = pending.title !== saved.title || pending.body !== saved.body;

    // Changed elsewhere (e.g. by the assistant, the module's data is reloaded after its changes): take over the changes,
    // unless there are unsaved ones (they are saved over them then)
    const [loadedNote, setLoadedNote] = useState(note);
    if (note !== loadedNote) {
        setLoadedNote(note);
        if (Date.parse(note.updatedAt) > saved.updatedAt) {
            if (!dirty) {
                setDraft({ title: note.title, body: note.body });
            }
            setSaved({ title: note.title, body: note.body, updatedAt: Date.parse(note.updatedAt) });
        }
    }

    // Saves one after another, so an older save can't overwrite a newer one
    const saveQueue = useRef(Promise.resolve());
    const save = (values: Values) => {
        saveQueue.current = saveQueue.current.then(async () => {
            setStatus("saving");
            try {
                // the fields named (not spread), so a renamed input field breaks the build instead of being dropped by the schema
                const { updated } = await parseResponse(
                    notesClient.notes[":id"].$patch({ param: { id: note.id }, json: { title: values.title, body: values.body } }),
                );
                setSaved({ ...values, updatedAt: Date.parse(updated.updatedAt) });
                setStatus("saved");
                updateCachedNote(updated);
                // the title and excerpt in the notebooks' grids (reloaded when shown, also after a save that outlives the editor; the
                // sidebar doesn't change)
                void queryClient.invalidateQueries({ queryKey: notesListsKey });
            } catch (error) {
                console.error(error);
                setStatus("error");
                showError("Saving the note failed, please try again.");
            }
        });
        return saveQueue.current;
    };

    // The unsaved changes, for saving them when the editor is closed before the autosave delay is over
    const unsaved = useRef<Values | null>(null);
    // nothing is saved anymore once the note is being deleted
    const deleting = useRef(false);
    useEffect(() => {
        unsaved.current = dirty ? pending : null;
        if (!dirty) {
            return;
        }
        const timeout = setTimeout(() => {
            unsaved.current = null;
            if (!deleting.current) {
                void save(pending);
            }
        }, autosaveDelay);
        return () => clearTimeout(timeout);
        // pending is derived from draft and saved
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, saved]);

    useEffect(() => {
        return () => {
            if (unsaved.current && !deleting.current) {
                void save(unsaved.current);
            }
        };
        // only on unmount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Warn before leaving the page (reload, closing the tab) with unsaved changes
    useEffect(() => {
        if (!dirty && status !== "saving") {
            return;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [dirty, status]);

    const handleDelete = async () => {
        deleting.current = true;
        try {
            await parseResponse(notesClient.notes[":id"].$delete({ param: { id: note.id } }));
        } catch (error) {
            deleting.current = false;
            throw error;
        }
        leavePage(notebookLink, { replace: true });
        // the deleted note isn't loaded again (it would be "not found"), the notebook's notes and the sidebar's note counts are reloaded
        queryClient.removeQueries({ queryKey: noteQuery(note.id).queryKey });
        void invalidate();
    };

    const handleMove = async (notebookId: string) => {
        // the move would be treated as a change made elsewhere: save first
        if (unsaved.current) {
            const values = unsaved.current;
            unsaved.current = null;
            await save(values);
        }
        try {
            const { updated } = await parseResponse(notesClient.notes[":id"].$patch({ param: { id: note.id }, json: { notebookId } }));
            // the page redirects to the note in its new notebook (like after a move by the assistant, see NotePage)
            updateCachedNote(updated);
        } catch (error) {
            console.error(error);
            showError("Moving the note failed, please try again.");
            return;
        }
        // the notebooks' notes and the sidebar's note counts
        await invalidate();
    };

    return (
        <article aria-label={draft.title || "Note"} className={clsx(layout.paper, layout.padded, layout.stackDense)}>
            <div className={styles.titleRow}>
                <div className={styles.titleField}>
                    <input
                        value={draft.title}
                        onChange={(event) => setDraft((values) => ({ ...values, title: event.target.value }))}
                        placeholder="Title"
                        aria-label="Title"
                        aria-invalid={!draft.title.trim() || undefined}
                        maxLength={maxNoteTitleLength}
                        className={styles.titleInput}
                    />
                    {!draft.title.trim() && <FormHelperText error>Title is required</FormHelperText>}
                </div>
                <MoveNoteButton currentNotebookId={note.notebookId} onMove={(notebookId) => void handleMove(notebookId)} />
                <DeleteNoteButton title={draft.title.trim() || saved.title} onDelete={handleDelete} />
            </div>
            <div className={styles.tabsRow}>
                <div className={layout.grow}>
                    <Tabs
                        value={mode}
                        onChange={setMode}
                        tabs={[
                            { value: "write", label: "Write" },
                            { value: "preview", label: "Preview" },
                        ]}
                    />
                </div>
                <Typography variant="caption" role="status" className={status === "error" ? styles.statusError : layout.muted}>
                    {status === "error" ? "Not saved" : status === "saving" || dirty ? "Saving…" : "Saved"}
                </Typography>
            </div>
            {mode === "write" ? (
                <textarea
                    value={draft.body}
                    onChange={(event) => setDraft((values) => ({ ...values, body: event.target.value }))}
                    rows={16}
                    placeholder="Write in Markdown: # Heading, **bold**, - list, [link](https://…)"
                    aria-label="Note"
                    maxLength={maxNoteBodyLength}
                    className={styles.body}
                />
            ) : draft.body.trim() ? (
                <MarkdownPreview markdown={draft.body} />
            ) : (
                <Typography className={clsx(layout.muted, styles.empty)}>Nothing to preview.</Typography>
            )}
        </article>
    );
}

function MoveNoteButton({ currentNotebookId, onMove }: { currentNotebookId: string; onMove: (notebookId: string) => void }) {
    const notebooks = useNotebooks().filter((notebook) => notebook.id !== currentNotebookId);

    if (notebooks.length === 0) {
        return null;
    }
    return (
        <Menu
            tooltip="Move to notebook"
            trigger={
                <IconButton variant="text" color="secondary" aria-label="Move to notebook">
                    <Icon name="move" />
                </IconButton>
            }
        >
            {notebooks.map((notebook) => (
                <MenuItem key={notebook.id} onClick={() => onMove(notebook.id)}>
                    {notebook.name}
                </MenuItem>
            ))}
        </Menu>
    );
}

// onDelete: deletes the note and leaves the page
function DeleteNoteButton({ title, onDelete }: { title: string; onDelete: () => Promise<void> }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    return (
        <>
            <Tooltip title="Delete note">
                <IconButton variant="text" color="secondary" onClick={() => setDialogOpen(true)} aria-label="Delete note">
                    <Icon name="delete" />
                </IconButton>
            </Tooltip>
            <ConfirmDeleteDialog
                open={dialogOpen}
                title="Delete note?"
                text={`“${title}” will be deleted.`}
                errorMessage="Deleting the note failed, please try again."
                onClose={() => setDialogOpen(false)}
                onDelete={onDelete}
            />
        </>
    );
}

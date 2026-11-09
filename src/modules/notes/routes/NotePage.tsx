import { ArrowLeft, Delete, Move } from "@dextinity/admin-icons";
import { Box, Container, IconButton, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { generatePath, Link, Navigate, useLocation, useNavigate } from "react-router";

import { api, isNotFound } from "~/api/client";
import { PageLoading } from "~/client/errors";
import { usePathParams } from "~/client/params";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { useShowError } from "~/components/ErrorSnackbar";
import { useDocumentTitle } from "~/components/useDocumentTitle";

import { MarkdownPreview } from "../components/MarkdownPreview";
import { maxNoteBodyLength, maxNoteTitleLength } from "../limits";
import { notebookPath, notePath } from "../paths";
import { notebooksQuery, noteQuery, notesQueryKey } from "../queries";

type Note = InferResponseType<(typeof api.notes)[":noteId"]["$get"], 200>;

// A note in the editor. The search params are the state of the notebook's grid (NotebookPage.tsx), kept for the back link.
export function NotePage() {
    const { notebookId, noteId } = usePathParams(notePath);
    const { search } = useLocation();
    // a 404 is shown by the page itself (other errors by the error boundary of the app layout)
    const { data: note, error } = useQuery({ ...noteQuery(noteId), throwOnError: (queryError) => !isNotFound(queryError) });

    // e.g. deleted by the assistant while open (the query still has the note from before then)
    if (isNotFound(error)) {
        return <NoteNotFound />;
    }
    if (note === undefined) {
        return (
            <NotePageLayout>
                <PageLoading />
            </NotePageLayout>
        );
    }
    // e.g. moved to another notebook by the assistant
    if (note.notebookId !== notebookId) {
        return <Navigate to={generatePath(notePath, { notebookId: note.notebookId, noteId }) + search} replace />;
    }
    return (
        <NotePageLayout>
            {/* a fresh editor (draft, save state) per note */}
            <NoteEditor key={note.id} note={note} />
        </NotePageLayout>
    );
}

function NoteNotFound() {
    useDocumentTitle();
    return (
        <NotePageLayout>
            <Paper sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">This note doesn't exist (anymore).</Typography>
            </Paper>
        </NotePageLayout>
    );
}

// The note's notebook with the grid state it was left in (the search params)
function useNotebookLink(notebookId: string) {
    return { pathname: generatePath(notebookPath, { notebookId }), search: useLocation().search };
}

// The back link to the notebook's grid (in the state it was left) above the editor
function NotePageLayout({ children }: { children: ReactNode }) {
    const { notebookId } = usePathParams(notePath);
    const notebookLink = useNotebookLink(notebookId);
    const { data: notebooks = [] } = useQuery(notebooksQuery);
    const notebook = notebooks.find((item) => item.id === notebookId);
    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip title="Back to the notebook">
                        <IconButton component={Link} to={notebookLink} edge="start" aria-label="Back to the notebook">
                            <ArrowLeft />
                        </IconButton>
                    </Tooltip>
                    <Typography color="text.secondary" noWrap>
                        {notebook?.name}
                    </Typography>
                </Box>
                {children}
            </Stack>
        </Container>
    );
}

// Changes are saved automatically shortly after typing stops
const autosaveDelay = 1000;

type Values = { title: string; body: string };

function NoteEditor({ note }: { note: Note }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const showError = useShowError();
    const notebookLink = useNotebookLink(note.notebookId);
    useDocumentTitle(note.title);

    // The cached note is updated with own changes: otherwise, when the note is opened again, the editor would start with the
    // cached (outdated) note until it's reloaded
    const updateCachedNote = (changes: Partial<Note>) =>
        queryClient.setQueryData(noteQuery(note.id).queryKey, (cached) => cached && { ...cached, ...changes });

    const [draft, setDraft] = useState<Values>({ title: note.title, body: note.body });
    // the stored state the draft is based on; updatedAt tells newer changes made elsewhere from outdated or own ones
    const [saved, setSaved] = useState<Values & { updatedAt: number }>({ title: note.title, body: note.body, updatedAt: Date.parse(note.updatedAt) });
    const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
    const [mode, setMode] = useState<"write" | "preview">(note.body ? "preview" : "write");

    // an empty title isn't saved (a note needs a title)
    const pending: Values = { title: draft.title.trim() || saved.title, body: draft.body };
    const dirty = pending.title !== saved.title || pending.body !== saved.body;

    // Changed elsewhere (e.g. by the assistant, the queries are reloaded after its changes): take over the changes,
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
                const { updatedAt } = await parseResponse(api.notes[":noteId"].$patch({ param: { noteId: note.id }, json: values }));
                setSaved({ ...values, updatedAt: Date.parse(updatedAt) });
                updateCachedNote({ ...values, updatedAt });
                setStatus("saved");
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
            await parseResponse(api.notes[":noteId"].$delete({ param: { noteId: note.id } }));
        } catch (error) {
            deleting.current = false;
            throw error;
        }
        await navigate(notebookLink, { replace: true });
        // after leaving the page, otherwise it would show "doesn't exist" while leaving
        queryClient.removeQueries({ queryKey: noteQuery(note.id).queryKey });
        // the notebook's notes and the sidebar's note counts
        await queryClient.invalidateQueries({ queryKey: notesQueryKey });
    };

    const handleMove = async (notebookId: string) => {
        // the move would be treated as a change made elsewhere: save first
        if (unsaved.current) {
            const values = unsaved.current;
            unsaved.current = null;
            await save(values);
        }
        try {
            const { updatedAt } = await parseResponse(api.notes[":noteId"].$patch({ param: { noteId: note.id }, json: { notebookId } }));
            // the page redirects to the note in its new notebook (like after a move by the assistant, see NotePage)
            updateCachedNote({ notebookId, updatedAt });
        } catch (error) {
            console.error(error);
            showError("Moving the note failed, please try again.");
            return;
        }
        // the notebooks' notes and the sidebar's note counts
        await queryClient.invalidateQueries({ queryKey: notesQueryKey });
    };

    return (
        <Paper component="article" aria-label={draft.title || "Note"} sx={{ p: 2 }}>
            <Stack spacing={1}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <TextField
                        value={draft.title}
                        onChange={(event) => setDraft((values) => ({ ...values, title: event.target.value }))}
                        variant="standard"
                        fullWidth
                        placeholder="Title"
                        error={!draft.title.trim()}
                        helperText={!draft.title.trim() && "Title is required"}
                        slotProps={{
                            htmlInput: { maxLength: maxNoteTitleLength, "aria-label": "Title" },
                            input: { disableUnderline: true, sx: { typography: "h5" } },
                        }}
                    />
                    <MoveNoteButton currentNotebookId={note.notebookId} onMove={(notebookId) => void handleMove(notebookId)} />
                    <DeleteNoteButton title={draft.title.trim() || saved.title} onDelete={handleDelete} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
                    <Tabs value={mode} onChange={(_event, value: typeof mode) => setMode(value)} sx={{ flexGrow: 1, minHeight: 0 }}>
                        <Tab value="write" label="Write" sx={{ minHeight: 0 }} />
                        <Tab value="preview" label="Preview" sx={{ minHeight: 0 }} />
                    </Tabs>
                    <Typography variant="caption" color={status === "error" ? "error" : "text.secondary"} role="status">
                        {status === "error" ? "Not saved" : status === "saving" || dirty ? "Saving…" : "Saved"}
                    </Typography>
                </Box>
                {mode === "write" ? (
                    <TextField
                        value={draft.body}
                        onChange={(event) => setDraft((values) => ({ ...values, body: event.target.value }))}
                        multiline
                        minRows={16}
                        fullWidth
                        placeholder="Write in Markdown: # Heading, **bold**, - list, [link](https://…)"
                        slotProps={{
                            htmlInput: { maxLength: maxNoteBodyLength, "aria-label": "Note" },
                            input: { sx: { fontFamily: "monospace", fontSize: "0.875rem" } },
                        }}
                    />
                ) : draft.body.trim() ? (
                    <MarkdownPreview markdown={draft.body} />
                ) : (
                    <Typography color="text.secondary" sx={{ py: 2 }}>
                        Nothing to preview.
                    </Typography>
                )}
            </Stack>
        </Paper>
    );
}

function MoveNoteButton({ currentNotebookId, onMove }: { currentNotebookId: string; onMove: (notebookId: string) => void }) {
    const { data: allNotebooks = [] } = useQuery(notebooksQuery);
    const notebooks = allNotebooks.filter((notebook) => notebook.id !== currentNotebookId);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    if (notebooks.length === 0) {
        return null;
    }
    return (
        <>
            <Tooltip title="Move to notebook">
                <IconButton onClick={(event) => setAnchor(event.currentTarget)} aria-label="Move to notebook" aria-haspopup="menu">
                    <Move />
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {notebooks.map((notebook) => (
                    <MenuItem
                        key={notebook.id}
                        onClick={() => {
                            setAnchor(null);
                            onMove(notebook.id);
                        }}
                    >
                        {notebook.name}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}

// onDelete: deletes the note and leaves the page
function DeleteNoteButton({ title, onDelete }: { title: string; onDelete: () => Promise<void> }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    return (
        <>
            <Tooltip title="Delete note">
                <IconButton onClick={() => setDialogOpen(true)} aria-label="Delete note">
                    <Delete />
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

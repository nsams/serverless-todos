import { ArrowLeft, Delete, Move } from "@dextinity/admin-icons";
import { Box, Container, IconButton, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { queryClient } from "~/api/client";
import { useChatPage } from "~/chat/useChatPage";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { useShowError } from "~/components/ErrorSnackbar";
import { linkProps, usePageTitle } from "~/routing";

import { notesApi } from "../api";
import { notesChatPage } from "../chatPage";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { maxNoteBodyLength, maxNoteTitleLength } from "../limits";
import type { NoteView } from "../operations.server";
import { notebookRoute, noteRoute } from "../routes";

// /notes/:notebookId/:noteId (noteRoute): a note in the editor. The search params are the state of the notebook's grid (notebook.tsx),
// kept for the back link.
export default function NotePage() {
    const { notebookId, noteId } = noteRoute.useParams();
    const search = noteRoute.useSearch();
    const note = noteRoute.useData();
    // what the assistant gets to know about the page
    useChatPage(notesChatPage, { notebookId: note.notebookId, noteId: note.id });
    return (
        <NotePageLayout>
            {/* moved to another notebook (in the editor or by the assistant): the URL follows the note */}
            {note.notebookId !== notebookId && <Navigate to={noteRoute.href({ notebookId: note.notebookId, noteId }, search)} replace />}
            {/* a fresh editor (draft, save state) per note */}
            <NoteEditor key={note.id} note={note} />
        </NotePageLayout>
    );
}

// The back link to the notebook's grid (in the state it was left) above the editor
function NotePageLayout({ children }: { children: ReactNode }) {
    const { notebookId } = noteRoute.useParams();
    const search = noteRoute.useSearch();
    const notebook = useNotebooks().find((item) => item.id === notebookId);
    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip title="Back to the notebook">
                        <IconButton
                            component={Link}
                            {...linkProps(notebookRoute.link({ notebookId }, search))}
                            edge="start"
                            aria-label="Back to the notebook"
                        >
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

function NoteEditor({ note }: { note: NoteView }) {
    const navigate = useNavigate();
    const showError = useShowError();
    const search = noteRoute.useSearch();
    // the note's query gets the saved note (no request); the notebooks' grids are reloaded (title and excerpt, when shown again), the sidebar
    // doesn't change
    const updateNote = useMutation(
        notesApi.updateNote.mutationOptions({
            meta: { invalidates: [notesApi.listNotes.pathKey()] },
            onSuccess: ({ updated }) => queryClient.setQueryData(notesApi.getNote.queryKey({ id: note.id }), updated),
        }),
    );
    // e.g. the sidebar's note counts
    const moveNote = useMutation(
        notesApi.updateNote.mutationOptions({
            onSuccess: ({ updated }) => queryClient.setQueryData(notesApi.getNote.queryKey({ id: note.id }), updated),
        }),
    );
    // leaves the page before the module's data (e.g. the sidebar's note counts) is reloaded, so the deleted note isn't loaded again
    const deleteNote = useMutation(
        notesApi.deleteNote.mutationOptions({
            onSuccess: () => navigate(notebookRoute.href({ notebookId: note.notebookId }, search), { replace: true }),
        }),
    );

    const [draft, setDraft] = useState<Values>({ title: note.title, body: note.body });
    // the stored state the draft is based on; updatedAt tells newer changes made elsewhere from outdated or own ones
    const [saved, setSaved] = useState<Values & { updatedAt: number }>({ title: note.title, body: note.body, updatedAt: note.updatedAt.getTime() });
    const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
    const [mode, setMode] = useState<"write" | "preview">(note.body ? "preview" : "write");
    // follows every save (and changes made elsewhere)
    usePageTitle(saved.title);

    // an empty title isn't saved (a note needs a title)
    const pending: Values = { title: draft.title.trim() || saved.title, body: draft.body };
    const dirty = pending.title !== saved.title || pending.body !== saved.body;

    // Changed elsewhere (e.g. by the assistant, the module's data is reloaded after its changes): take over the changes,
    // unless there are unsaved ones (they are saved over them then)
    const [loadedNote, setLoadedNote] = useState(note);
    if (note !== loadedNote) {
        setLoadedNote(note);
        if (note.updatedAt.getTime() > saved.updatedAt) {
            if (!dirty) {
                setDraft({ title: note.title, body: note.body });
            }
            setSaved({ title: note.title, body: note.body, updatedAt: note.updatedAt.getTime() });
        }
    }

    // Saves one after another, so an older save can't overwrite a newer one
    const saveQueue = useRef(Promise.resolve());
    const save = (values: Values) => {
        saveQueue.current = saveQueue.current.then(async () => {
            setStatus("saving");
            try {
                const { updated } = await updateNote.mutateAsync({ id: note.id, title: values.title, body: values.body });
                setSaved({ ...values, updatedAt: updated.updatedAt.getTime() });
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
            await deleteNote.mutateAsync({ id: note.id });
        } catch (error) {
            deleting.current = false;
            throw error;
        }
    };

    const handleMove = async (notebookId: string) => {
        // the move would be treated as a change made elsewhere: save first
        if (unsaved.current) {
            const values = unsaved.current;
            unsaved.current = null;
            await save(values);
        }
        try {
            // the page follows the note to its new notebook (NotePage)
            await moveNote.mutateAsync({ id: note.id, notebookId });
        } catch (error) {
            console.error(error);
            showError("Moving the note failed, please try again.");
        }
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

// The user's notebooks (the back link's name, the "move to" menu); empty while loading, the page doesn't wait for them
function useNotebooks() {
    return useQuery(notesApi.listNotebooks.queryOptions({})).data ?? [];
}

function MoveNoteButton({ currentNotebookId, onMove }: { currentNotebookId: string; onMove: (notebookId: string) => void }) {
    const notebooks = useNotebooks().filter((notebook) => notebook.id !== currentNotebookId);
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

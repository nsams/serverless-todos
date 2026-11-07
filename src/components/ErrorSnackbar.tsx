import { Alert, Snackbar } from "@mui/material";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

const ShowErrorContext = createContext<(message: string) => void>(() => {});

// Shows errors of actions that have no form to show them in (e.g. a failed save in the grid)
export function ErrorSnackbarProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    // kept while the snackbar is closing
    const [message, setMessage] = useState("");

    const showError = useCallback((newMessage: string) => {
        setMessage(newMessage);
        setOpen(true);
    }, []);

    return (
        <ShowErrorContext.Provider value={showError}>
            {children}
            <Snackbar
                open={open}
                autoHideDuration={6000}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                onClose={(_event, reason) => reason !== "clickaway" && setOpen(false)}
            >
                <Alert severity="error" variant="filled" onClose={() => setOpen(false)}>
                    {message}
                </Alert>
            </Snackbar>
        </ShowErrorContext.Provider>
    );
}

export function useShowError() {
    return useContext(ShowErrorContext);
}

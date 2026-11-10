import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { Component, type ComponentType, type ReactNode } from "react";
import { useLocation } from "react-router";

import { useDocumentTitle } from "~/components/useDocumentTitle";
import { NotFoundError } from "~/errors";

type ErrorBoundaryProps = {
    children: ReactNode;
    // shows the error
    fallback: (error: unknown) => ReactNode;
    // the error is cleared when it changes (e.g. the path: another page)
    resetKey: string;
    onReset: () => void;
};

// Catches errors while rendering, including the errors of the queries (see src/client/queries.ts)
class ErrorBoundary extends Component<ErrorBoundaryProps, { error: unknown; resetKey: string }> {
    state = { error: undefined, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: unknown) {
        return { error };
    }

    static getDerivedStateFromProps(props: ErrorBoundaryProps, state: { error: unknown; resetKey: string }) {
        // not by remounting the children: a page stays mounted while only its params change (e.g. another list)
        return props.resetKey !== state.resetKey ? { error: undefined, resetKey: props.resetKey } : null;
    }

    componentDidUpdate(_props: ErrorBoundaryProps, previousState: { error: unknown }) {
        if (previousState.error !== undefined && this.state.error === undefined) {
            this.props.onReset();
        }
    }

    render() {
        return this.state.error !== undefined ? this.props.fallback(this.state.error) : this.props.children;
    }
}

// Shows the errors of its children (e.g. a list that doesn't exist (anymore)) instead of them, until the user goes to another page.
// Used around the pages in the app layout (AppLayout.tsx) and around the whole app (AppRoutes.tsx); a page can show its errors itself
// (Fallback, e.g. NotePage.tsx).
export function PageErrorBoundary({ children, Fallback = PageError }: { children: ReactNode; Fallback?: ComponentType<{ error: unknown }> }) {
    const { pathname } = useLocation();
    const queryClient = useQueryClient();
    // The failed queries are forgotten: coming back to the page fetches its data again instead of showing the cached error
    // (e.g. after a network error)
    const forgetFailedQueries = () => queryClient.removeQueries({ type: "inactive", predicate: (query) => query.state.status === "error" });
    return (
        <ErrorBoundary resetKey={pathname} onReset={forgetFailedQueries} fallback={(error) => <Fallback error={error} />}>
            {children}
        </ErrorBoundary>
    );
}

// The error of a page; the API's 404 (thrown by the typed clients, src/api/client.ts) as "not found"
export function PageError({ error }: { error: unknown }) {
    if (error instanceof NotFoundError) {
        return <NotFoundPage />;
    }
    console.error(error);
    return <ErrorMessage message="Error" details={import.meta.env.DEV && error instanceof Error ? error.message : "An unexpected error occurred."} />;
}

// Also the page of unknown paths (AppRoutes.tsx)
export function NotFoundPage() {
    return <ErrorMessage message="404" details="The requested page could not be found." />;
}

function ErrorMessage({ message, details }: { message: string; details: string }) {
    useDocumentTitle();
    return (
        <Container sx={{ py: 4 }}>
            <Typography variant="h4">{message}</Typography>
            <Typography>{details}</Typography>
        </Container>
    );
}

// While a page's code or data is loading for the first time (afterwards the page shows the previous data while loading, see usePageQuery)
export function PageLoading() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
            <CircularProgress />
        </Box>
    );
}

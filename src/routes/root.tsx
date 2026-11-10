import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, type ReactNode, useEffect } from "react";
import { useLocation } from "react-router";

import { NotFoundError } from "~/errors";
import { usePageTitle } from "~/routing";

// Loading, error handling and scrolling of the routes (src/router.tsx)

type ErrorBoundaryProps = {
    // the error is reset when this changes (e.g. the location: another page or other search params are shown)
    resetKey: unknown;
    onReset: () => void;
    fallback: (error: unknown) => ReactNode;
    children: ReactNode;
};

// Catches the errors thrown while rendering its children (e.g. a page whose data wasn't found, see useData in src/routing.tsx) and
// shows the fallback instead. React has error boundaries only as class components.
class ErrorBoundary extends Component<ErrorBoundaryProps, { error: { value: unknown } | null }> {
    state: { error: { value: unknown } | null } = { error: null };

    static getDerivedStateFromError(error: unknown) {
        return { error: { value: error } };
    }

    componentDidUpdate(previousProps: ErrorBoundaryProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.props.onReset();
            this.setState({ error: null });
        }
    }

    render() {
        return this.state.error ? this.props.fallback(this.state.error.value) : this.props.children;
    }
}

// The error boundary of the pages: 404 (NotFoundError of the API, e.g. a list that doesn't exist (anymore)) or an error page instead of
// the page, until another location is shown. The failed queries are loaded again then (QueryErrorResetBoundary).
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
    const { pathname, search } = useLocation();
    const { reset } = useQueryErrorResetBoundary();
    return (
        <ErrorBoundary resetKey={pathname + search} onReset={reset} fallback={(error) => <RouteError error={error} />}>
            {children}
        </ErrorBoundary>
    );
}

// A page's own "not found" content instead of the 404 page, e.g. the note page keeps its back link when the note doesn't exist (anymore):
// shows the fallback when the children throw a NotFoundError (until another location is shown), other errors go to RouteErrorBoundary
export function NotFoundBoundary({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
    const { pathname, search } = useLocation();
    const { reset } = useQueryErrorResetBoundary();
    return (
        <ErrorBoundary
            resetKey={pathname + search}
            onReset={reset}
            fallback={(error) => {
                if (!(error instanceof NotFoundError)) {
                    throw error;
                }
                return fallback;
            }}
        >
            {children}
        </ErrorBoundary>
    );
}

// 404 and unexpected errors (logged by onCaughtError in src/main.tsx)
function RouteError({ error }: { error: unknown }) {
    if (error instanceof NotFoundError) {
        return <NotFound />;
    }
    return <ErrorMessage message="Error" details={import.meta.env.DEV && error instanceof Error ? error.message : "An unexpected error occurred."} />;
}

// Unknown paths and pages whose data doesn't exist
export function NotFound() {
    return <ErrorMessage message="404" details="The requested page could not be found." />;
}

function ErrorMessage({ message, details }: { message: string; details: string }) {
    usePageTitle();
    return (
        <Container sx={{ py: 4 }}>
            <Typography variant="h4">{message}</Typography>
            <Typography>{details}</Typography>
        </Container>
    );
}

// Shown while the first page (its code and data) is loading; later navigations keep showing the previous page meanwhile
export function PageLoading() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
            <CircularProgress />
        </Box>
    );
}

// Scrolls to the top when another page is shown (not when only the search params change, e.g. a grid's page or filter)
export function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
}

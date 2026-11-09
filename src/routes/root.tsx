import { Container, Typography } from "@mui/material";
import { Component, type ReactNode, useEffect } from "react";
import { useLocation } from "react-router";

import { isNotFoundError } from "~/api/client";
import { usePageTitle } from "~/routing";

// Error handling and scrolling of the routes (src/router.tsx)

type ErrorBoundaryProps = {
    // the error is reset when this changes (e.g. the path: another page is shown)
    resetKey: unknown;
    fallback: (error: unknown) => ReactNode;
    children: ReactNode;
};

// Catches the errors thrown while rendering its children (e.g. by useApiQuery in src/routing.tsx) and shows the fallback instead
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: { value: unknown } | null }> {
    state: { error: { value: unknown } | null } = { error: null };

    static getDerivedStateFromError(error: unknown) {
        return { error: { value: error } };
    }

    componentDidUpdate(previousProps: ErrorBoundaryProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        return this.state.error ? this.props.fallback(this.state.error.value) : this.props.children;
    }
}

// The error boundary of the pages: 404 (NOT_FOUND of the API) or an error page instead of the page, until another page is shown
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    return (
        <ErrorBoundary resetKey={pathname} fallback={(error) => <RouteError error={error} />}>
            {children}
        </ErrorBoundary>
    );
}

// 404 (e.g. a list that doesn't exist (anymore)) and unexpected errors (logged by onCaughtError in src/main.tsx)
export function RouteError({ error }: { error: unknown }) {
    if (isNotFoundError(error)) {
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

// Scrolls to the top when another page is shown (not when only the search params change, e.g. a grid's page or filter)
export function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
}

import { Toast } from "@base-ui/react/toast";
import { Icon } from "@dextinity/ui";
import { createContext, type ReactNode, useCallback, useContext } from "react";

import styles from "./ErrorSnackbar.module.css";

const ShowErrorContext = createContext<(message: string) => void>(() => {});

// Shows errors of actions that have no form to show them in (e.g. a failed save in the grid), as a toast (Base UI, styled with the
// @dextinity/ui tokens; @dextinity/ui has no toast yet)
export function ErrorSnackbarProvider({ children }: { children: ReactNode }) {
    return (
        // one at a time: a new error replaces the shown one
        <Toast.Provider timeout={6000} limit={1}>
            <ShowErrorProvider>{children}</ShowErrorProvider>
            <Toast.Portal>
                <Toast.Viewport className={styles.viewport}>
                    <Toasts />
                </Toast.Viewport>
            </Toast.Portal>
        </Toast.Provider>
    );
}

function ShowErrorProvider({ children }: { children: ReactNode }) {
    const { add } = Toast.useToastManager();
    const showError = useCallback((message: string) => void add({ description: message, type: "error" }), [add]);
    return <ShowErrorContext.Provider value={showError}>{children}</ShowErrorContext.Provider>;
}

function Toasts() {
    const { toasts } = Toast.useToastManager();
    return toasts.map((toast) => (
        <Toast.Root key={toast.id} toast={toast} className={styles.toast}>
            <Icon name="error" />
            <Toast.Description className={styles.description} />
            <Toast.Close aria-label="Close" className={styles.close}>
                <Icon name="close" />
            </Toast.Close>
        </Toast.Root>
    ));
}

export function useShowError() {
    return useContext(ShowErrorContext);
}

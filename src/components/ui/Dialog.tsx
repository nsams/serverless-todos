import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import styles from "./Dialog.module.css";

type Props = {
    open: boolean;
    // closing by Escape or a click outside; not called while closing isn't allowed (e.g. while saving, the caller ignores it)
    onClose: () => void;
    title: ReactNode;
    // after the closing animation, e.g. to reset the dialog's state
    onClosed?: () => void;
    children: ReactNode;
};

// A modal dialog with a title (Base UI, styled with the @dextinity/ui dialog tokens; @dextinity/ui has no dialog yet). Content and
// actions go in DialogContent and DialogActions, a form can wrap both.
export function Dialog({ open, onClose, title, onClosed, children }: Props) {
    return (
        <BaseDialog.Root
            open={open}
            onOpenChange={(nextOpen) => !nextOpen && onClose()}
            onOpenChangeComplete={(nextOpen) => !nextOpen && onClosed?.()}
        >
            <BaseDialog.Portal>
                <BaseDialog.Backdrop className={styles.backdrop} />
                <BaseDialog.Viewport className={styles.viewport}>
                    <BaseDialog.Popup className={styles.popup}>
                        <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
                        {children}
                    </BaseDialog.Popup>
                </BaseDialog.Viewport>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
}

export function DialogContent({ children }: { children: ReactNode }) {
    return <div className={styles.content}>{children}</div>;
}

// a paragraph of the content, the dialog's accessible description
export function DialogText({ children }: { children: ReactNode }) {
    return <BaseDialog.Description className={styles.text}>{children}</BaseDialog.Description>;
}

export function DialogActions({ children }: { children: ReactNode }) {
    return <div className={styles.actions}>{children}</div>;
}

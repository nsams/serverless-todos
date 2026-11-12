import { Icon } from "@dextinity/ui";
import { clsx } from "clsx";
import type { ReactNode } from "react";

import styles from "./Alert.module.css";

// An error message, e.g. why saving a form failed (@dextinity/ui has no alert yet). A banner spans the width of its container (no
// rounded corners, only a bottom border).
export function Alert({ children, banner, className }: { children: ReactNode; banner?: boolean; className?: string }) {
    return (
        <div role="alert" className={clsx(styles.alert, banner && styles.banner, className)}>
            <Icon name="error" className={styles.icon} />
            <div>{children}</div>
        </div>
    );
}

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

import styles from "./Tooltip.module.css";

// Shows a short text on hover and keyboard focus of its child (Base UI, styled with the @dextinity/ui tokens). The child must accept
// a ref and event props, e.g. an IconButton. It's only a visual hint: the child still needs its own accessible name (aria-label).
export function Tooltip({ title, children }: { title: string; children: ReactElement }) {
    return (
        <BaseTooltip.Root>
            <BaseTooltip.Trigger render={children} />
            <BaseTooltip.Portal>
                <BaseTooltip.Positioner sideOffset={6}>
                    <BaseTooltip.Popup className={styles.popup}>{title}</BaseTooltip.Popup>
                </BaseTooltip.Positioner>
            </BaseTooltip.Portal>
        </BaseTooltip.Root>
    );
}

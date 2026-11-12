import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";

import styles from "./Menu.module.css";
import { Tooltip } from "./Tooltip";

// A menu opened by its trigger, e.g. an IconButton, optionally with a tooltip (Base UI, styled with the @dextinity/ui tokens;
// @dextinity/ui has no menu yet)
export function Menu({ trigger, tooltip, children }: { trigger: ReactElement; tooltip?: string; children: ReactNode }) {
    const menuTrigger = <BaseMenu.Trigger render={trigger} />;
    return (
        <BaseMenu.Root>
            {tooltip !== undefined ? <Tooltip title={tooltip}>{menuTrigger}</Tooltip> : menuTrigger}
            <BaseMenu.Portal>
                <BaseMenu.Positioner sideOffset={4} align="end">
                    <BaseMenu.Popup className={styles.popup}>{children}</BaseMenu.Popup>
                </BaseMenu.Positioner>
            </BaseMenu.Portal>
        </BaseMenu.Root>
    );
}

// closes the menu when clicked
export function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <BaseMenu.Item className={styles.item} onClick={onClick}>
            {children}
        </BaseMenu.Item>
    );
}

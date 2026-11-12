import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Icon } from "@dextinity/ui";
import type { ReactNode, Ref } from "react";

import styles from "./Checkbox.module.css";

type Props = {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    // shown next to the box; without it, the checkbox needs an aria-label
    label?: ReactNode;
    "aria-label"?: string;
    name?: string;
    onBlur?: () => void;
    disabled?: boolean;
    // the checkbox's button, e.g. for react-hook-form to focus it
    ref?: Ref<HTMLButtonElement>;
};

// A checkbox (Base UI, styled with the @dextinity/ui checkbox tokens; @dextinity/ui has no checkbox yet)
export function Checkbox({ checked, onCheckedChange, label, "aria-label": ariaLabel, name, onBlur, disabled, ref }: Props) {
    const box = (
        <BaseCheckbox.Root
            ref={ref}
            className={styles.box}
            checked={checked}
            onCheckedChange={(newChecked) => onCheckedChange(newChecked)}
            aria-label={ariaLabel}
            name={name}
            onBlur={onBlur}
            disabled={disabled}
        >
            <BaseCheckbox.Indicator className={styles.indicator}>
                <Icon name="check" />
            </BaseCheckbox.Indicator>
        </BaseCheckbox.Root>
    );
    if (label === undefined) {
        return box;
    }
    return (
        <label className={styles.label}>
            {box}
            {label}
        </label>
    );
}

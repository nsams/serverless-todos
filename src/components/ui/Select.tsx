import { Select as BaseSelect } from "@base-ui/react/select";
import { FormLabel, Icon } from "@dextinity/ui";
import { clsx } from "clsx";
import { type Ref, useId } from "react";

import styles from "./Select.module.css";

type Props = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    name?: string;
    onBlur?: () => void;
    disabled?: boolean;
    className?: string;
    // the select's button, e.g. for react-hook-form to focus it
    ref?: Ref<HTMLButtonElement>;
};

// Picks one of a few options (Base UI, styled with the @dextinity/ui select tokens; @dextinity/ui has no select yet)
export function Select({ label, value, onChange, options, name, onBlur, disabled, className, ref }: Props) {
    const id = useId();
    return (
        <div className={clsx(styles.field, className)}>
            <FormLabel htmlFor={id}>{label}</FormLabel>
            <BaseSelect.Root
                items={options}
                value={value}
                onValueChange={(newValue) => newValue !== null && onChange(newValue)}
                name={name}
                disabled={disabled}
            >
                <BaseSelect.Trigger ref={ref} id={id} className={styles.trigger} onBlur={onBlur}>
                    <BaseSelect.Value className={styles.value} />
                    <BaseSelect.Icon className={styles.chevron}>
                        <Icon name="chevron-down" />
                    </BaseSelect.Icon>
                </BaseSelect.Trigger>
                <BaseSelect.Portal>
                    <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false}>
                        <BaseSelect.Popup className={styles.popup}>
                            <BaseSelect.List>
                                {options.map((option) => (
                                    <BaseSelect.Item key={option.value} value={option.value} className={styles.option}>
                                        <BaseSelect.ItemText className={styles.optionText}>{option.label}</BaseSelect.ItemText>
                                        <BaseSelect.ItemIndicator className={styles.check}>
                                            <Icon name="check" />
                                        </BaseSelect.ItemIndicator>
                                    </BaseSelect.Item>
                                ))}
                            </BaseSelect.List>
                        </BaseSelect.Popup>
                    </BaseSelect.Positioner>
                </BaseSelect.Portal>
            </BaseSelect.Root>
        </div>
    );
}

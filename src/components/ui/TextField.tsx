import { FormHelperText, FormLabel, Input } from "@dextinity/ui";
import { clsx } from "clsx";
import { type ComponentPropsWithRef, type ReactNode, useId } from "react";

import styles from "./TextField.module.css";

type FieldProps = {
    // the visible label; without it, the input needs an aria-label
    label?: ReactNode;
    // shown below the input and marks it as invalid, e.g. "Title is required"
    error?: string | null | false;
    required?: boolean;
    className?: string;
};

type InputFieldProps = FieldProps &
    Omit<ComponentPropsWithRef<"input">, "className" | "style" | "size"> & {
        startAdornment?: ReactNode;
        multiline?: false;
    };

type MultilineFieldProps = FieldProps &
    Omit<ComponentPropsWithRef<"textarea">, "className" | "style"> & {
        multiline: true;
    };

// A text field with a label and an error message: @dextinity/ui's FormLabel, Input and FormHelperText, and a textarea with the input's
// look for multiline text (@dextinity/ui has no textarea yet)
export function TextField(props: InputFieldProps | MultilineFieldProps) {
    const generatedId = useId();
    const id = props.id ?? generatedId;
    const helperTextId = `${id}-helper-text`;
    const { label, error, required, className } = props;
    const describedBy = error ? helperTextId : undefined;

    let control: ReactNode;
    if (props.multiline) {
        const { label: _label, error: _error, className: _className, multiline: _multiline, ...textareaProps } = props;
        control = (
            <textarea
                {...textareaProps}
                id={id}
                className={styles.textarea}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                data-status={error ? "error" : undefined}
            />
        );
    } else {
        const { label: _label, error: _error, className: _className, multiline: _multiline, startAdornment, ...inputProps } = props;
        control = (
            <Input {...inputProps} id={id} status={error ? "error" : undefined} startAdornment={startAdornment} aria-describedby={describedBy} />
        );
    }

    return (
        <div className={clsx(styles.field, className)}>
            {label !== undefined && (
                <FormLabel htmlFor={id} required={required} error={!!error}>
                    {label}
                </FormLabel>
            )}
            {control}
            {error && (
                <FormHelperText id={helperTextId} error>
                    {error}
                </FormHelperText>
            )}
        </div>
    );
}

import { IconButton, type IconButtonProps } from "@dextinity/ui";
import type { ReactElement } from "react";

type Props = Omit<IconButtonProps, "render" | "nativeButton" | "type" | "role"> & {
    // the link element, e.g. <Link to="..." /> or <a href="..." />
    render: ReactElement;
};

// @dextinity/ui's IconButton as a link: it navigates, so it stays a link for assistive technology (open in new tab etc. work too).
// Base UI gives a non-<button> button role="button", removed here (the type="button" the IconButton sets is ignored on a link).
export function IconButtonLink({ render, ...props }: Props) {
    return <IconButton {...props} nativeButton={false} render={render} role={undefined} />;
}

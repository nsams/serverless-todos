import { Markdown } from "markdown-to-jsx/react";

import styles from "./MarkdownPreview.module.css";

const options = {
    // raw HTML in a note is shown as text, not rendered (javascript:/data: URLs are removed by the default sanitizer)
    disableParsingRawHTML: true,
    overrides: {
        a: { props: { target: "_blank", rel: "noopener noreferrer" } },
    },
};

// A note's body (Markdown) rendered
export function MarkdownPreview({ markdown }: { markdown: string }) {
    return (
        <div className={styles.markdown}>
            <Markdown options={options}>{markdown}</Markdown>
        </div>
    );
}

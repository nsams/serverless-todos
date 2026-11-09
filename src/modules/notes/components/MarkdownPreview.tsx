import { Box } from "@mui/material";
import { Markdown } from "markdown-to-jsx/react";

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
        <Box
            sx={{
                typography: "body1",
                overflowWrap: "anywhere",
                "& h1": { typography: "h4", mt: 0, mb: 1 },
                "& h2": { typography: "h5", mt: 0, mb: 1 },
                "& h3": { typography: "h6", mt: 0, mb: 1 },
                "& h4, & h5, & h6": { typography: "subtitle1", fontWeight: "bold", mt: 0, mb: 1 },
                // space above headings, except at the top (no :first-child, it's unsafe with server rendering)
                "& * + h1, & * + h2": { mt: 3 },
                "& * + h3, & * + h4, & * + h5, & * + h6": { mt: 2 },
                "& p, & ul, & ol, & blockquote, & pre, & table": { mt: 0, mb: 1.5 },
                "& ul, & ol": { pl: 3 },
                "& a": { color: "primary.main" },
                "& code": { fontFamily: "monospace", fontSize: "0.875em", bgcolor: "action.hover", px: 0.5, borderRadius: 0.5 },
                "& pre": { bgcolor: "action.hover", p: 1.5, borderRadius: 1, overflowX: "auto" },
                "& pre code": { bgcolor: "transparent", p: 0 },
                "& blockquote": { borderLeft: 4, borderColor: "divider", pl: 2, mx: 0, color: "text.secondary" },
                "& table": { borderCollapse: "collapse" },
                "& th, & td": { border: 1, borderColor: "divider", px: 1, py: 0.5 },
                "& img": { maxWidth: "100%" },
                "& hr": { border: 0, borderTop: 1, borderColor: "divider", my: 2 },
            }}
        >
            <Markdown options={options}>{markdown}</Markdown>
        </Box>
    );
}

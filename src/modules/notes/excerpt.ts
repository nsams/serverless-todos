// The beginning of a Markdown body as plain text, for the notes list (roughly: the Markdown syntax characters are removed)
export function plainExcerpt(markdown: string) {
    return markdown
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

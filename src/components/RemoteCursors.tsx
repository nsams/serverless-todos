import { Box } from "@mui/material";
import { type RefObject, useLayoutEffect, useState } from "react";

// The cursor (and selection) of another user in a text input
export type RemoteCursor = {
    id: string;
    name: string;
    color: string;
    // the selection: anchor (where it started) and head (where the cursor is), as indexes in the input's value
    anchor: number;
    head: number;
};

type Props = {
    input: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
    cursors: RemoteCursor[];
    // the input's value (the positions are measured again when it changes)
    value: string;
};

type Rect = { left: number; top: number; width: number; height: number };

type Measured = { id: string; name: string; color: string; caret: Rect; selection: Rect[] };

// Shows the cursors of others in a text input (<input> or <textarea>): a caret with the user's name, and the selected text highlighted.
// Rendered next to the input inside a positioned container (the overlay is positioned relative to it). Text inputs have no DOM for
// their text, so the positions are measured with a hidden copy of the input (same styles and text).
export function RemoteCursors({ input, cursors, value }: Props) {
    const [measured, setMeasured] = useState<Measured[]>([]);
    const [scroll, setScroll] = useState(0);

    // measured again when the input scrolls or changes its size
    useLayoutEffect(() => {
        const element = input.current;
        if (!element) {
            return;
        }
        const update = () => setScroll((count) => count + 1);
        const observer = new ResizeObserver(update);
        observer.observe(element);
        element.addEventListener("scroll", update);
        return () => {
            observer.disconnect();
            element.removeEventListener("scroll", update);
        };
    }, [input]);

    useLayoutEffect(() => {
        const element = input.current;
        const container = element?.closest<HTMLElement>("[data-remote-cursors-container]");
        if (!element || !container) {
            return;
        }
        const offset = element.getBoundingClientRect();
        const containerOffset = container.getBoundingClientRect();
        const dx = offset.left - containerOffset.left;
        const dy = offset.top - containerOffset.top;
        const length = element.value.length;
        const clamp = (index: number) => Math.max(0, Math.min(index, length));
        const visible = (rect: Rect) => rect.left >= 0 && rect.left <= element.clientWidth && rect.top >= 0 && rect.top < element.clientHeight;
        const next = cursors.flatMap(({ id, name, color, anchor, head }) => {
            const caret = measureRange(element, clamp(head), clamp(head))[0];
            if (!caret || !visible(caret)) {
                return [];
            }
            const start = clamp(Math.min(anchor, head));
            const end = clamp(Math.max(anchor, head));
            const selection = start === end ? [] : measureRange(element, start, end);
            const move = (rect: Rect) => ({ ...rect, left: rect.left + dx, top: rect.top + dy });
            return [{ id, name, color, caret: move(caret), selection: selection.map(move) }];
        });
        // only when something moved (no render loop)
        setMeasured((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    }, [input, cursors, value, scroll]);

    return (
        <>
            {measured.map(({ id, name, color, caret, selection }) => (
                <Box key={id} aria-hidden sx={{ pointerEvents: "none" }}>
                    {selection.map((rect, index) => (
                        <Box key={index} sx={{ position: "absolute", ...rect, bgcolor: color, opacity: 0.2 }} />
                    ))}
                    <Box sx={{ position: "absolute", left: caret.left - 1, top: caret.top, width: 2, height: caret.height, bgcolor: color }} />
                    <Box
                        sx={{
                            position: "absolute",
                            left: caret.left - 1,
                            top: caret.top,
                            transform: "translateY(-100%)",
                            px: 0.5,
                            borderRadius: "3px 3px 3px 0",
                            bgcolor: color,
                            color: "#fff",
                            fontSize: 11,
                            lineHeight: "16px",
                            whiteSpace: "nowrap",
                            zIndex: 1,
                        }}
                    >
                        {name}
                    </Box>
                </Box>
            ))}
        </>
    );
}

// The styles that affect where the text of an input is laid out
const mirroredStyles = [
    "boxSizing",
    "width",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontFamily",
    "fontFeatureSettings",
    "fontVariationSettings",
    "lineHeight",
    "textAlign",
    "textTransform",
    "textIndent",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
] as const;

// The rectangles of the text from start to end (a caret if equal), relative to the input's border box and its scroll position
function measureRange(input: HTMLInputElement | HTMLTextAreaElement, start: number, end: number): Rect[] {
    const style = window.getComputedStyle(input);
    const singleLine = input instanceof HTMLInputElement;
    const mirror = document.createElement("div");
    for (const property of mirroredStyles) {
        mirror.style[property] = style[property];
    }
    Object.assign(mirror.style, {
        position: "absolute",
        top: "0",
        left: "-10000px",
        visibility: "hidden",
        overflow: "hidden",
        whiteSpace: singleLine ? "pre" : "pre-wrap",
        overflowWrap: singleLine ? "normal" : "break-word",
        // a single line is centered vertically in the input
        ...(singleLine ? { height: style.height, lineHeight: style.height } : {}),
    });
    const value = input.value;
    const marked = document.createElement("span");
    // a zero-width character marks a caret
    marked.textContent = start === end ? "​" : value.slice(start, end);
    mirror.appendChild(document.createTextNode(value.slice(0, start)));
    mirror.appendChild(marked);
    mirror.appendChild(document.createTextNode(value.slice(end)));
    document.body.appendChild(mirror);
    const origin = mirror.getBoundingClientRect();
    const rects = [...marked.getClientRects()].map((rect) => ({
        left: rect.left - origin.left - input.scrollLeft,
        top: rect.top - origin.top - input.scrollTop,
        width: start === end ? 0 : rect.width,
        height: rect.height,
    }));
    mirror.remove();
    return rects;
}

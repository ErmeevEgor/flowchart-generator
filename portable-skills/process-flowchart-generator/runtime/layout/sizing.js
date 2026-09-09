export const DEFAULT_SIZING = {
    minWidth: 176,
    maxWidth: 264,
    horizontalPadding: 28,
    verticalPadding: 22,
    lineHeight: 20,
    metadataLineHeight: 17,
    averageCharacterWidth: 7.2,
};
export function measureNode(node, options = DEFAULT_SIZING) {
    const preferredChars = Math.max(18, Math.floor((options.maxWidth - options.horizontalPadding * 2) / options.averageCharacterWidth));
    const textLines = wrapText(node.text, preferredChars);
    const longest = Math.max(...textLines.map((line) => line.length), 12);
    let width = clamp(longest * options.averageCharacterWidth + options.horizontalPadding * 2, options.minWidth, options.maxWidth);
    const metadataLines = [
        node.role,
        node.system,
        node.document ? `«${node.document}»` : undefined,
        node.subprocess ? `Подпроцесс: ${node.subprocess}` : undefined,
    ].filter((value) => Boolean(value));
    let height = options.verticalPadding * 2 + textLines.length * options.lineHeight;
    if (metadataLines.length > 0)
        height += 10 + metadataLines.length * options.metadataLineHeight;
    if (node.type === "decision") {
        width = Math.max(width, 190);
        height = Math.max(height + 20, 112);
    }
    else if (node.type === "start" || node.type === "end" || node.type === "boundary") {
        height = Math.max(height, 72);
    }
    else {
        height = Math.max(height, 82);
    }
    return { bounds: { width: Math.ceil(width), height: Math.ceil(height) }, textLines, metadataLines };
}
export function wrapText(text, maxCharacters) {
    const explicit = text.replace(/\r/g, "").split("\n");
    const lines = [];
    for (const paragraph of explicit) {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push("");
            continue;
        }
        let current = "";
        for (const word of words) {
            if (current === "") {
                current = word;
            }
            else if (`${current} ${word}`.length <= maxCharacters) {
                current += ` ${word}`;
            }
            else {
                lines.push(current);
                current = word;
            }
        }
        if (current)
            lines.push(current);
    }
    return lines.length > 0 ? lines : [""];
}
function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
//# sourceMappingURL=sizing.js.map
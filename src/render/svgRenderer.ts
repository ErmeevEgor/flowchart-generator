import type { LayoutNode, Point, ProcessLayout } from "../model/processModel.js";
import { measureNode, wrapText } from "../layout/sizing.js";

export function renderSvg(layout: ProcessLayout): string {
  const titleOffset = layout.title ? 42 : 0;
  const width = layout.width;
  const height = layout.height + titleOffset;
  const edges = layout.edges.map((edge) => {
    const points = edge.points.map((point) => `${round(point.x)},${round(point.y + titleOffset)}`).join(" ");
    const label = edge.label && edge.labelPoint
      ? `<g class="edge-label"><rect x="${round(edge.labelPoint.x - edge.label.length * 3.8 - 5)}" y="${round(edge.labelPoint.y + titleOffset - 11)}" width="${round(edge.label.length * 7.6 + 10)}" height="20" rx="4"/><text x="${round(edge.labelPoint.x)}" y="${round(edge.labelPoint.y + titleOffset + 3)}">${escapeXml(edge.label)}</text></g>`
      : "";
    return `<g id="${escapeXml(edge.id)}"><polyline class="edge" points="${points}" marker-end="url(#arrow)"/>${label}</g>`;
  }).join("\n");
  const nodes = layout.nodes.map((node) => renderNode(node, titleOffset)).join("\n");
  const title = layout.title ? `<text class="title" x="60" y="42">${escapeXml(layout.title)}</text>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(layout.title ?? "Схема бизнес-процесса")}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#344054"/></marker>
    <filter id="shadow" x="-10%" y="-15%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#101828" flood-opacity="0.10"/></filter>
  </defs>
  <style>
    .canvas{fill:#f8fafc}.edge{fill:none;stroke:#344054;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.node{stroke:#475467;stroke-width:1.5;filter:url(#shadow)}
    .action{fill:#fff}.terminal{fill:#eef4ff;stroke:#3538cd}.decision{fill:#fffaeb;stroke:#b54708}.boundary{fill:#f2f4f7;stroke-dasharray:6 4}
    text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#101828}.node-text{font-size:14px;font-weight:600;text-anchor:middle}.metadata{font-size:12px;fill:#475467;text-anchor:middle}.document{font-style:italic}.subprocess{fill:#3538cd;font-weight:600}.edge-label text{font-size:12px;font-weight:600;text-anchor:middle}.edge-label rect{fill:#fff;stroke:#d0d5dd}.title{font-size:20px;font-weight:700}
  </style>
  <rect class="canvas" width="100%" height="100%"/>
  ${title}
  ${edges}
  ${nodes}
</svg>`;
}

function renderNode(node: LayoutNode, yOffset: number): string {
  const { x, y: rawY, width, height } = node.bounds;
  const y = rawY + yOffset;
  let shape: string;
  if (node.type === "decision") {
    shape = `<polygon class="node decision" points="${round(x + width / 2)},${round(y)} ${round(x + width)},${round(y + height / 2)} ${round(x + width / 2)},${round(y + height)} ${round(x)},${round(y + height / 2)}"/>`;
  } else {
    const className = node.type === "start" || node.type === "end" ? "terminal" : node.type === "boundary" ? "boundary" : "action";
    const radius = node.type === "start" || node.type === "end" || node.type === "boundary" ? Math.min(26, height / 2) : 8;
    shape = `<rect class="node ${className}" x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="${round(radius)}"/>`;
  }

  const measured = measureNode(node);
  const maxCharacters = Math.max(12, Math.floor((width - 56) / 7.2));
  const lines = wrapText(node.text, maxCharacters);
  const metadata = measured.metadataLines;
  const totalTextHeight = lines.length * 20 + (metadata.length > 0 ? 10 + metadata.length * 17 : 0);
  let cursor = y + (height - totalTextHeight) / 2 + 14;
  const textParts: string[] = [];
  for (const line of lines) {
    textParts.push(`<text class="node-text" x="${round(x + width / 2)}" y="${round(cursor)}">${escapeXml(line)}</text>`);
    cursor += 20;
  }
  if (metadata.length > 0) cursor += 7;
  metadata.forEach((line, index) => {
    const className = node.document && line === `«${node.document}»`
      ? "metadata document"
      : node.subprocess && line === `Подпроцесс: ${node.subprocess}`
        ? "metadata subprocess"
        : "metadata";
    textParts.push(`<text class="${className}" x="${round(x + width / 2)}" y="${round(cursor)}">${escapeXml(line)}</text>`);
    cursor += 17;
    void index;
  });
  return `<g id="${escapeXml(node.id)}">${shape}${textParts.join("")}</g>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

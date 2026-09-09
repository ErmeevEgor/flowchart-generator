export function renderDrawio(layout) {
    const cells = [
        '<mxCell id="0"/>',
        '<mxCell id="1" parent="0"/>',
    ];
    for (const node of layout.nodes) {
        const { x, y, width, height } = node.bounds;
        cells.push(`<mxCell id="${xml(node.id)}" value="${xml(nodeValue(node))}" style="${nodeStyle(node)}" vertex="1" parent="1"><mxGeometry x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" as="geometry"/></mxCell>`);
    }
    for (const edge of layout.edges) {
        const waypoints = edge.points.slice(1, -1).map((point) => `<mxPoint x="${round(point.x)}" y="${round(point.y)}"/>`).join("");
        const points = waypoints ? `<Array as="points">${waypoints}</Array>` : "";
        const label = edge.label ? xml(edge.label) : "";
        const source = layout.nodes.find((node) => node.id === edge.from);
        const target = layout.nodes.find((node) => node.id === edge.to);
        const exit = portStyle(edge.points[0], source, "exit");
        const entry = portStyle(edge.points[edge.points.length - 1], target, "entry");
        cells.push(`<mxCell id="${xml(edge.id)}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeWidth=2;strokeColor=#344054;fontSize=12;fontStyle=1;labelBackgroundColor=#ffffff;${exit}${entry}" edge="1" parent="1" source="${xml(edge.from)}" target="${xml(edge.to)}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`);
    }
    const pageWidth = Math.max(1169, Math.ceil(layout.width));
    const pageHeight = Math.max(827, Math.ceil(layout.height));
    return `<mxfile host="app.diagrams.net" modified="${new Date(0).toISOString()}" agent="Schemes-generator" version="24.7.17" type="device">
  <diagram id="process" name="${xml(layout.title ?? "Процесс")}">
    <mxGraphModel dx="${pageWidth}" dy="${pageHeight}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0">
      <root>${cells.join("")}</root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}
function portStyle(point, node, prefix) {
    const { x, y, width, height } = node.bounds;
    const distances = [
        { x: 0, y: 0.5, distance: Math.abs(point.x - x) },
        { x: 1, y: 0.5, distance: Math.abs(point.x - (x + width)) },
        { x: 0.5, y: 0, distance: Math.abs(point.y - y) },
        { x: 0.5, y: 1, distance: Math.abs(point.y - (y + height)) },
    ].sort((a, b) => a.distance - b.distance);
    const port = distances[0];
    return `${prefix}X=${port.x};${prefix}Y=${port.y};${prefix}Dx=0;${prefix}Dy=0;${prefix}Perimeter=1;`;
}
function nodeStyle(node) {
    const common = "whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=14;fontFamily=Segoe UI;spacing=12;strokeWidth=2;";
    if (node.type === "decision")
        return `${common}shape=rhombus;perimeter=rhombusPerimeter;fillColor=#fffaeb;strokeColor=#b54708;`;
    if (node.type === "start" || node.type === "end")
        return `${common}rounded=1;arcSize=40;fillColor=#eef4ff;strokeColor=#3538cd;`;
    if (node.type === "boundary")
        return `${common}rounded=1;arcSize=25;dashed=1;fillColor=#f2f4f7;strokeColor=#475467;`;
    return `${common}rounded=1;arcSize=10;fillColor=#ffffff;strokeColor=#475467;`;
}
function nodeValue(node) {
    const details = [];
    if (node.role)
        details.push(node.role);
    if (node.system)
        details.push(node.system);
    if (node.document)
        details.push(`«${node.document}»`);
    if (node.subprocess)
        details.push(`Подпроцесс: ${node.subprocess}`);
    return details.length > 0 ? `<b>${html(node.text)}</b><br><br><font color="#475467" style="font-size:12px">${details.map(html).join("<br>")}</font>` : `<b>${html(node.text)}</b>`;
}
function html(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\n/g, "<br>");
}
function xml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function round(value) {
    return Math.round(value * 10) / 10;
}
//# sourceMappingURL=drawioRenderer.js.map
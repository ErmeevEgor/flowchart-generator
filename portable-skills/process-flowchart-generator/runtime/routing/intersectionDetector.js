export function detectEdgeIntersections(edges) {
    const result = [];
    for (let i = 0; i < edges.length; i += 1) {
        const first = edges[i];
        for (let j = i + 1; j < edges.length; j += 1) {
            const second = edges[j];
            const shareNode = first.from === second.from || first.from === second.to || first.to === second.from || first.to === second.to;
            // Incident edges are expected to meet and may intentionally share a short
            // fan-out or fan-in segment near their common node. Those joins are part
            // of the graph topology, not visual crossings.
            if (shareNode)
                continue;
            let found;
            for (let a = 0; a < first.points.length - 1 && !found; a += 1) {
                for (let b = 0; b < second.points.length - 1 && !found; b += 1) {
                    const hit = orthogonalIntersection(first.points[a], first.points[a + 1], second.points[b], second.points[b + 1]);
                    if (!hit)
                        continue;
                    found = { first: first.id, second: second.id, ...hit };
                }
            }
            if (found)
                result.push(found);
        }
    }
    return result;
}
function orthogonalIntersection(a1, a2, b1, b2) {
    const aVertical = a1.x === a2.x;
    const bVertical = b1.x === b2.x;
    if (aVertical !== bVertical) {
        const verticalA = aVertical ? a1 : b1;
        const verticalB = aVertical ? a2 : b2;
        const horizontalA = aVertical ? b1 : a1;
        const horizontalB = aVertical ? b2 : a2;
        const x = verticalA.x;
        const y = horizontalA.y;
        if (between(x, horizontalA.x, horizontalB.x) && between(y, verticalA.y, verticalB.y)) {
            return { point: { x, y }, overlap: false };
        }
        return undefined;
    }
    if (aVertical && a1.x === b1.x) {
        const low = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
        const high = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
        if (low <= high)
            return { point: { x: a1.x, y: (low + high) / 2 }, overlap: high > low };
    }
    if (!aVertical && a1.y === b1.y) {
        const low = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
        const high = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
        if (low <= high)
            return { point: { x: (low + high) / 2, y: a1.y }, overlap: high > low };
    }
    return undefined;
}
function between(value, a, b) {
    return value >= Math.min(a, b) && value <= Math.max(a, b);
}
//# sourceMappingURL=intersectionDetector.js.map
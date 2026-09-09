import { segmentIntersectsRect } from "../validation/layoutValidator.js";
export const DEFAULT_ROUTING = {
    obstacleClearance: 10,
    channelGap: 28,
    returnGap: 42,
};
export function routeEdges(model, nodeLayout, options = DEFAULT_ROUTING) {
    const byId = new Map(nodeLayout.nodes.map((node) => [node.id, node]));
    const routed = [];
    const maxBottom = Math.max(...nodeLayout.nodes.map((node) => node.bounds.y + node.bounds.height));
    let returnIndex = 0;
    model.edges.forEach((edge, index) => {
        const source = byId.get(edge.from);
        const target = byId.get(edge.to);
        if (!source || !target)
            return;
        const isReturn = nodeLayout.backEdgeIndexes.has(index) || edge.kind === "return" || target.rank <= source.rank;
        const crossOutgoing = model.edges.filter((candidate, candidateIndex) => {
            const candidateTarget = byId.get(candidate.to);
            return candidate.from === edge.from && candidateTarget?.lane !== source.lane && !nodeLayout.backEdgeIndexes.has(candidateIndex) && candidate.kind !== "return";
        });
        const crossIncoming = model.edges.filter((candidate, candidateIndex) => {
            const candidateSource = byId.get(candidate.from);
            return candidate.to === edge.to && candidateSource?.lane !== target.lane && !nodeLayout.backEdgeIndexes.has(candidateIndex) && candidate.kind !== "return";
        });
        const startOffset = portOffset(crossOutgoing.indexOf(edge), crossOutgoing.length);
        const endOffset = portOffset(crossIncoming.indexOf(edge), crossIncoming.length);
        const candidates = isReturn
            ? returnCandidates(source, target, nodeLayout.nodes, maxBottom, options, returnIndex++)
            : forwardCandidates(source, target, nodeLayout.nodes, maxBottom, options, startOffset, endOffset);
        const points = selectRoute(candidates, source, target, nodeLayout.nodes, routed, options.obstacleClearance);
        const routedEdge = { ...edge, id: edge.id ?? `e${index + 1}`, points };
        if (edge.label)
            routedEdge.labelPoint = findLabelPoint(points);
        routed.push(routedEdge);
    });
    return {
        ...(model.title ? { title: model.title } : {}),
        nodes: nodeLayout.nodes,
        edges: routed,
        width: nodeLayout.width,
        height: nodeLayout.height,
    };
}
export function rerouteEdges(model, nodeLayout, options) {
    return routeEdges(model, nodeLayout, options);
}
function forwardCandidates(source, target, nodes, maxBottom, options, startOffset, endOffset) {
    if (target.lane !== source.lane)
        return branchCandidates(source, target, nodes, maxBottom, options, startOffset, endOffset);
    const start = rightAnchor(source);
    const end = leftAnchor(target);
    const middle = (start.x + end.x) / 2;
    const sourceChannel = columnRight(source.rank, nodes) + options.channelGap;
    const targetChannel = columnLeft(target.rank, nodes) - options.channelGap;
    const bottom = maxBottom + options.returnGap;
    const candidates = [];
    if (Math.abs(start.y - end.y) < 0.01)
        candidates.push([start, end]);
    for (const x of unique([middle, sourceChannel, targetChannel])) {
        candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
    }
    candidates.push([
        start,
        { x: sourceChannel, y: start.y },
        { x: sourceChannel, y: bottom },
        { x: targetChannel, y: bottom },
        { x: targetChannel, y: end.y },
        end,
    ]);
    return candidates.map(compactPoints);
}
function branchCandidates(source, target, nodes, maxBottom, options, startOffset, endOffset) {
    const goesDown = target.bounds.y > source.bounds.y;
    const start = goesDown ? bottomAnchor(source, startOffset + 20) : rightAnchor(source);
    const end = goesDown ? topAnchor(target, endOffset) : bottomAnchor(target, endOffset - 20);
    const middleY = (start.y + end.y) / 2;
    const sourceChannel = start.y + (goesDown ? options.channelGap : -options.channelGap);
    const targetChannel = end.y + (goesDown ? -options.channelGap : options.channelGap);
    const candidates = [];
    if (Math.abs(start.x - end.x) < 0.01)
        candidates.push([start, end]);
    for (const y of unique([middleY, sourceChannel, targetChannel])) {
        candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
    }
    const sourceX = columnRight(source.rank, nodes) + options.channelGap;
    const targetX = columnLeft(target.rank, nodes) - options.channelGap;
    const bottom = maxBottom + options.returnGap;
    candidates.push([start, { x: start.x, y: bottom }, { x: sourceX, y: bottom }, { x: targetX, y: bottom }, { x: targetX, y: end.y }, end]);
    return candidates.map(compactPoints);
}
function returnCandidates(source, target, nodes, maxBottom, options, index) {
    const start = bottomAnchor(source);
    const end = bottomAnchor(target);
    const sourceChannel = columnRight(source.rank, nodes) + options.channelGap;
    const targetChannel = columnLeft(target.rank, nodes) - options.channelGap;
    // Forward branch fallbacks use the first channel below the node field.
    // Keep return loops one channel farther out so they do not run through
    // those branch fan-in paths.
    const y = maxBottom + options.returnGap * 2 + index * 24;
    const outerRight = Math.max(...nodes.map((node) => node.bounds.x + node.bounds.width)) + options.channelGap * 2 + index * 16;
    const outerLeft = Math.min(...nodes.map((node) => node.bounds.x)) - options.channelGap * 2 - index * 16;
    return [
        compactPoints([start, { x: start.x, y }, { x: end.x, y }, end]),
        compactPoints([start, { x: sourceChannel, y: start.y }, { x: sourceChannel, y }, { x: targetChannel, y }, { x: targetChannel, y: end.y }, end]),
        compactPoints([start, { x: outerRight, y: start.y }, { x: outerRight, y }, { x: outerLeft, y }, { x: outerLeft, y: end.y }, end]),
    ];
}
function selectRoute(candidates, source, target, nodes, routed, clearance) {
    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        const obstacleHits = countObstacleHits(candidate, source.id, target.id, nodes, clearance);
        const crossingHits = countExistingEdgeHits(candidate, routed);
        const length = pathLength(candidate);
        const score = obstacleHits * 1_000_000 + crossingHits * 10_000 + (candidate.length - 2) * 100 + length;
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}
function countObstacleHits(points, sourceId, targetId, nodes, clearance) {
    let count = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        for (const node of nodes) {
            if (node.id === sourceId || node.id === targetId)
                continue;
            if (segmentIntersectsRect(points[i], points[i + 1], node.bounds, clearance))
                count += 1;
        }
    }
    return count;
}
function countExistingEdgeHits(points, edges) {
    let hits = 0;
    for (const edge of edges) {
        for (let a = 0; a < points.length - 1; a += 1) {
            for (let b = 0; b < edge.points.length - 1; b += 1) {
                if (segmentsCross(points[a], points[a + 1], edge.points[b], edge.points[b + 1]))
                    hits += 1;
            }
        }
    }
    return hits;
}
function segmentsCross(a1, a2, b1, b2) {
    const aVertical = a1.x === a2.x;
    const bVertical = b1.x === b2.x;
    if (aVertical === bVertical)
        return false;
    const v1 = aVertical ? a1 : b1;
    const v2 = aVertical ? a2 : b2;
    const h1 = aVertical ? b1 : a1;
    const h2 = aVertical ? b2 : a2;
    return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y);
}
function pathLength(points) {
    let result = 0;
    for (let i = 0; i < points.length - 1; i += 1)
        result += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    return result;
}
function findLabelPoint(points) {
    let bestStart = points[0];
    let bestEnd = points[1] ?? points[0];
    let bestLength = -1;
    for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
        if (length > bestLength) {
            bestStart = start;
            bestEnd = end;
            bestLength = length;
        }
    }
    return { x: (bestStart.x + bestEnd.x) / 2, y: (bestStart.y + bestEnd.y) / 2 - 8 };
}
function rightAnchor(node) {
    return { x: node.bounds.x + node.bounds.width, y: node.bounds.y + node.bounds.height / 2 };
}
function leftAnchor(node) {
    return { x: node.bounds.x, y: node.bounds.y + node.bounds.height / 2 };
}
function topAnchor(node, offset = 0) {
    return { x: clamp(node.bounds.x + node.bounds.width / 2 + offset, node.bounds.x + 24, node.bounds.x + node.bounds.width - 24), y: node.bounds.y };
}
function bottomAnchor(node, offset = 0) {
    return { x: clamp(node.bounds.x + node.bounds.width / 2 + offset, node.bounds.x + 24, node.bounds.x + node.bounds.width - 24), y: node.bounds.y + node.bounds.height };
}
function portOffset(index, count) {
    if (index < 0 || count <= 1)
        return 0;
    return (index - (count - 1) / 2) * 30;
}
function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
function columnRight(rank, nodes) {
    return Math.max(...nodes.filter((node) => node.rank === rank).map((node) => node.bounds.x + node.bounds.width));
}
function columnLeft(rank, nodes) {
    return Math.min(...nodes.filter((node) => node.rank === rank).map((node) => node.bounds.x));
}
function compactPoints(points) {
    const uniquePoints = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
    return uniquePoints.filter((point, index) => {
        if (index === 0 || index === uniquePoints.length - 1)
            return true;
        const before = uniquePoints[index - 1];
        const after = uniquePoints[index + 1];
        return !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y));
    });
}
function unique(values) {
    return [...new Set(values.map((value) => Math.round(value * 100) / 100))];
}
//# sourceMappingURL=edgeRouter.js.map
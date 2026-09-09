import type { LayoutNode, ProcessEdge, ProcessModel, ProcessNode } from "../model/processModel.js";
import { measureNode } from "./sizing.js";

export interface LayoutOptions {
  horizontalGap: number;
  verticalGap: number;
  branchGap: number;
  canvasPadding: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  horizontalGap: 110,
  verticalGap: 64,
  branchGap: 88,
  canvasPadding: 60,
};

export interface NodeLayoutResult {
  nodes: LayoutNode[];
  backEdgeIndexes: Set<number>;
  happyPath: string[];
  width: number;
  height: number;
}

export function layoutProcess(model: ProcessModel, options: LayoutOptions = DEFAULT_LAYOUT): NodeLayoutResult {
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  const outgoing = createOutgoing(model.edges);
  const backEdgeIndexes = findBackEdges(model, outgoing);
  const happyPath = findHappyPath(model, outgoing);
  const happySet = new Set(happyPath);
  const ranks = assignRanks(model, backEdgeIndexes);
  const lanes = assignLanes(model, happyPath, happySet, outgoing, backEdgeIndexes);
  makeRankLanePairsUnique(model.nodes, ranks, lanes);

  const measured = new Map(model.nodes.map((node) => [node.id, measureNode(node)]));
  const maxRank = Math.max(0, ...ranks.values());
  const rankWidths = Array.from({ length: maxRank + 1 }, () => 0);
  for (const node of model.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    rankWidths[rank] = Math.max(rankWidths[rank] ?? 0, measured.get(node.id)!.bounds.width);
  }
  const rankX: number[] = [];
  let x = options.canvasPadding;
  for (let rank = 0; rank <= maxRank; rank += 1) {
    rankX[rank] = x;
    x += (rankWidths[rank] ?? 0) + options.horizontalGap;
  }

  const maxLane = Math.max(0, ...lanes.values());
  const laneHeights = Array.from({ length: maxLane + 1 }, () => 0);
  for (const node of model.nodes) {
    const lane = lanes.get(node.id) ?? 0;
    laneHeights[lane] = Math.max(laneHeights[lane] ?? 0, measured.get(node.id)!.bounds.height);
  }
  const laneY: number[] = [];
  let y = options.canvasPadding;
  for (let lane = 0; lane <= maxLane; lane += 1) {
    laneY[lane] = y;
    y += (laneHeights[lane] ?? 0) + (lane === 0 ? options.branchGap : options.verticalGap);
  }

  const nodes = model.nodes.map((node): LayoutNode => {
    const rank = ranks.get(node.id) ?? 0;
    const lane = lanes.get(node.id) ?? 0;
    const size = measured.get(node.id)!.bounds;
    const columnWidth = rankWidths[rank] ?? size.width;
    const rowHeight = laneHeights[lane] ?? size.height;
    return {
      ...node,
      rank,
      lane,
      bounds: {
        x: (rankX[rank] ?? options.canvasPadding) + (columnWidth - size.width) / 2,
        y: (laneY[lane] ?? options.canvasPadding) + (rowHeight - size.height) / 2,
        width: size.width,
        height: size.height,
      },
    };
  });

  const maxRight = Math.max(...nodes.map((node) => node.bounds.x + node.bounds.width), options.canvasPadding);
  const maxBottom = Math.max(...nodes.map((node) => node.bounds.y + node.bounds.height), options.canvasPadding);
  void byId;
  return {
    nodes,
    backEdgeIndexes,
    happyPath,
    width: Math.ceil(maxRight + options.canvasPadding),
    height: Math.ceil(maxBottom + options.canvasPadding + (backEdgeIndexes.size > 0 ? 90 : 0)),
  };
}

function createOutgoing(edges: ProcessEdge[]): Map<string, Array<{ edge: ProcessEdge; index: number }>> {
  const result = new Map<string, Array<{ edge: ProcessEdge; index: number }>>();
  edges.forEach((edge, index) => {
    const list = result.get(edge.from) ?? [];
    list.push({ edge, index });
    result.set(edge.from, list);
  });
  return result;
}

function findHappyPath(model: ProcessModel, outgoing: Map<string, Array<{ edge: ProcessEdge; index: number }>>): string[] {
  const incoming = new Map(model.nodes.map((node) => [node.id, 0]));
  for (const edge of model.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const start = model.nodes.find((node) => node.type === "start")
    ?? model.nodes.find((node) => node.type === "boundary" && (incoming.get(node.id) ?? 0) === 0)
    ?? model.nodes.find((node) => (incoming.get(node.id) ?? 0) === 0)
    ?? model.nodes[0];
  if (!start) return [];

  const path: string[] = [];
  const seen = new Set<string>();
  let current: ProcessNode | undefined = start;
  while (current && !seen.has(current.id)) {
    path.push(current.id);
    seen.add(current.id);
    const choices: Array<{ edge: ProcessEdge; index: number }> = (outgoing.get(current.id) ?? [])
      .filter(({ edge }) => !seen.has(edge.to) && edge.kind !== "return");
    choices.sort((a, b) => edgePriority(a.edge, a.index) - edgePriority(b.edge, b.index));
    const nextId: string | undefined = choices[0]?.edge.to;
    current = nextId ? model.nodes.find((node) => node.id === nextId) : undefined;
  }
  return path;
}

function edgePriority(edge: ProcessEdge, index: number): number {
  if (edge.kind === "main") return index;
  if (/^(да|yes|основн)/iu.test(edge.label ?? "")) return 10_000 + index;
  if (edge.kind === "alternative") return 30_000 + index;
  return 20_000 + index;
}

function findBackEdges(model: ProcessModel, outgoing: Map<string, Array<{ edge: ProcessEdge; index: number }>>): Set<number> {
  const result = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const item of outgoing.get(id) ?? []) {
      if (item.edge.kind === "return" || state.get(item.edge.to) === 1) {
        result.add(item.index);
      } else if (!state.get(item.edge.to)) {
        visit(item.edge.to);
      }
    }
    state.set(id, 2);
  };
  for (const node of model.nodes) if (!state.get(node.id)) visit(node.id);
  return result;
}

function assignRanks(model: ProcessModel, backEdges: Set<number>): Map<string, number> {
  const incoming = new Map(model.nodes.map((node) => [node.id, 0]));
  model.edges.forEach((edge, index) => {
    if (!backEdges.has(index)) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  });
  const rank = new Map<string, number>();
  for (const node of model.nodes) if ((incoming.get(node.id) ?? 0) === 0) rank.set(node.id, 0);
  if (rank.size === 0 && model.nodes[0]) rank.set(model.nodes[0].id, 0);

  for (let pass = 0; pass < model.nodes.length; pass += 1) {
    let changed = false;
    model.edges.forEach((edge, index) => {
      if (backEdges.has(index) || !rank.has(edge.from)) return;
      const proposed = (rank.get(edge.from) ?? 0) + 1;
      if (!rank.has(edge.to) || proposed > (rank.get(edge.to) ?? 0)) {
        rank.set(edge.to, proposed);
        changed = true;
      }
    });
    if (!changed) break;
  }
  for (const node of model.nodes) if (!rank.has(node.id)) rank.set(node.id, 0);
  return rank;
}

function assignLanes(
  model: ProcessModel,
  happyPath: string[],
  happySet: Set<string>,
  outgoing: Map<string, Array<{ edge: ProcessEdge; index: number }>>,
  backEdges: Set<number>,
): Map<string, number> {
  const lanes = new Map<string, number>();
  for (const id of happyPath) lanes.set(id, 0);
  let nextLane = 1;

  for (const happyId of happyPath) {
    const mainNext = happyPath[happyPath.indexOf(happyId) + 1];
    for (const item of outgoing.get(happyId) ?? []) {
      if (item.edge.to === mainNext || happySet.has(item.edge.to) || backEdges.has(item.index)) continue;
      const lane = nextLane++;
      const queue = [item.edge.to];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (happySet.has(id) || lanes.has(id)) continue;
        lanes.set(id, lane);
        for (const child of outgoing.get(id) ?? []) if (!backEdges.has(child.index)) queue.push(child.edge.to);
      }
    }
  }

  const forwardIncoming = new Map(model.nodes.map((node) => [node.id, 0]));
  model.edges.forEach((edge, index) => {
    if (!backEdges.has(index)) forwardIncoming.set(edge.to, (forwardIncoming.get(edge.to) ?? 0) + 1);
  });
  for (const node of model.nodes) {
    const choices = (outgoing.get(node.id) ?? [])
      .filter((item) => !backEdges.has(item.index))
      .sort((a, b) => edgePriority(a.edge, a.index) - edgePriority(b.edge, b.index));
    if (choices.length < 2) continue;
    for (const alternative of choices.slice(1)) {
      if ((lanes.get(alternative.edge.to) ?? lanes.get(node.id) ?? 0) !== (lanes.get(node.id) ?? 0)) continue;
      const lane = nextLane++;
      const seed = alternative.edge.to;
      const queue = [seed];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id) || happySet.has(id)) continue;
        visited.add(id);
        if (id !== seed && (forwardIncoming.get(id) ?? 0) > 1) continue;
        lanes.set(id, lane);
        for (const child of outgoing.get(id) ?? []) if (!backEdges.has(child.index)) queue.push(child.edge.to);
      }
    }
  }
  for (const node of model.nodes) if (!lanes.has(node.id)) lanes.set(node.id, nextLane++);
  return lanes;
}

function makeRankLanePairsUnique(nodes: ProcessNode[], ranks: Map<string, number>, lanes: Map<string, number>): void {
  const used = new Set<string>();
  let maxLane = Math.max(0, ...lanes.values());
  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0;
    let lane = lanes.get(node.id) ?? 0;
    while (used.has(`${rank}:${lane}`)) lane = ++maxLane;
    lanes.set(node.id, lane);
    used.add(`${rank}:${lane}`);
  }
}

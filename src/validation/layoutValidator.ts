import type { Bounds, Diagnostic, Point, ProcessLayout, ValidationResult } from "../model/processModel.js";
import { detectEdgeIntersections } from "../routing/intersectionDetector.js";

export interface LayoutValidationOptions {
  nodeClearance?: number;
}

export function validateLayout(layout: ProcessLayout, options: LayoutValidationOptions = {}): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const clearance = options.nodeClearance ?? 2;

  for (let i = 0; i < layout.nodes.length; i += 1) {
    const a = layout.nodes[i]!;
    if (a.bounds.x < 0 || a.bounds.y < 0 || a.bounds.x + a.bounds.width > layout.width || a.bounds.y + a.bounds.height > layout.height) {
      diagnostics.push(warning("NODE_OUTSIDE_CANVAS", `Node '${a.id}' extends outside the canvas.`, [a.id]));
    }
    for (let j = i + 1; j < layout.nodes.length; j += 1) {
      const b = layout.nodes[j]!;
      if (rectanglesOverlap(a.bounds, b.bounds, clearance)) {
        diagnostics.push(error("NODE_OVERLAP", `Nodes '${a.id}' and '${b.id}' overlap.`, [a.id, b.id]));
      }
    }
  }

  for (const edge of layout.edges) {
    for (let i = 0; i < edge.points.length - 1; i += 1) {
      const start = edge.points[i]!;
      const end = edge.points[i + 1]!;
      for (const node of layout.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        if (segmentIntersectsRect(start, end, node.bounds, clearance)) {
          diagnostics.push(error("EDGE_THROUGH_NODE", `Edge '${edge.id}' crosses node '${node.id}'.`, [edge.id, node.id]));
        }
      }
    }
  }

  for (const crossing of detectEdgeIntersections(layout.edges)) {
    diagnostics.push(warning("EDGE_INTERSECTION", `Edges '${crossing.first}' and '${crossing.second}' intersect.`, [crossing.first, crossing.second]));
  }

  return { valid: diagnostics.every((item) => item.severity !== "error"), diagnostics };
}

export function rectanglesOverlap(a: Bounds, b: Bounds, gap = 0): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

export function segmentIntersectsRect(a: Point, b: Point, rect: Bounds, gap = 0): boolean {
  const left = rect.x - gap;
  const right = rect.x + rect.width + gap;
  const top = rect.y - gap;
  const bottom = rect.y + rect.height + gap;
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  return false;
}

function error(code: string, message: string, elements?: string[]): Diagnostic {
  const diagnostic: Diagnostic = { severity: "error", code, message };
  if (elements) diagnostic.elements = elements;
  return diagnostic;
}

function warning(code: string, message: string, elements?: string[]): Diagnostic {
  const diagnostic: Diagnostic = { severity: "warning", code, message };
  if (elements) diagnostic.elements = elements;
  return diagnostic;
}

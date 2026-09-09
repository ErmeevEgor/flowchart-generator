export const NODE_TYPES = ["start", "end", "action", "decision", "boundary"] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export interface ProcessNode {
  id: string;
  type: NodeType;
  text: string;
  role?: string;
  system?: string;
  document?: string;
  /** Derived display marker used when an overview node has a separate detail diagram. */
  subprocess?: string;
}

export interface ProcessEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  kind?: "main" | "alternative" | "return" | "parallel";
}

export interface ProcessModel {
  title?: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

export type GenerationMode = "process_only" | "process_with_subprocesses";

export interface ProcessSubprocess {
  /** Stable file-safe identifier chosen during extraction. */
  id: string;
  /** Node in the overview that this diagram expands. */
  overviewNodeId: string;
  title?: string;
  process: ProcessModel;
}

export interface ProcessBundle {
  title?: string;
  overview: ProcessModel;
  subprocesses: ProcessSubprocess[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds extends Point {
  width: number;
  height: number;
}

export interface LayoutNode extends ProcessNode {
  bounds: Bounds;
  rank: number;
  lane: number;
}

export interface RoutedEdge extends ProcessEdge {
  id: string;
  points: Point[];
  labelPoint?: Point;
}

export interface ProcessLayout {
  title?: string;
  nodes: LayoutNode[];
  edges: RoutedEdge[];
  width: number;
  height: number;
}

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  elements?: string[];
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

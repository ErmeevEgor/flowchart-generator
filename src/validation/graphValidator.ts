import { NODE_TYPES, type Diagnostic, type ProcessModel, type ValidationResult } from "../model/processModel.js";

export function validateGraph(model: ProcessModel): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();

  for (const node of model.nodes) {
    if (ids.has(node.id)) {
      diagnostics.push(error("DUPLICATE_NODE_ID", `Node id '${node.id}' is duplicated.`, [node.id]));
    }
    ids.add(node.id);
    if (node.text.trim() === "") diagnostics.push(error("EMPTY_NODE_TEXT", `Node '${node.id}' has empty text.`, [node.id]));
    if (!NODE_TYPES.includes(node.type)) diagnostics.push(error("UNSUPPORTED_NODE_TYPE", `Node '${node.id}' has unsupported type.`, [node.id]));
  }

  const outgoing = new Map<string, typeof model.edges>();
  const incomingCount = new Map(model.nodes.map((node) => [node.id, 0]));
  for (const edge of model.edges) {
    if (!ids.has(edge.from)) diagnostics.push(error("UNKNOWN_EDGE_SOURCE", `Edge source '${edge.from}' does not exist.`, [edge.from]));
    if (!ids.has(edge.to)) diagnostics.push(error("UNKNOWN_EDGE_TARGET", `Edge target '${edge.to}' does not exist.`, [edge.to]));
    if (edge.from === edge.to) diagnostics.push(error("SELF_LOOP", `Self-loop on '${edge.from}' is not allowed.`, [edge.from]));
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
    if (incomingCount.has(edge.to)) incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  for (const node of model.nodes) {
    const routes = outgoing.get(node.id) ?? [];
    if (node.type === "decision") {
      if (routes.length < 2) {
        diagnostics.push(error("DECISION_WITHOUT_BRANCHES", `Decision '${node.id}' must have at least two outgoing routes.`, [node.id]));
      }
      for (const edge of routes) {
        if (!edge.label?.trim()) diagnostics.push(error("UNLABELLED_DECISION_EDGE", `Every route from decision '${node.id}' must have a label.`, [node.id, edge.to]));
      }
    }
    if (node.type !== "decision" && routes.length > 1 && !routes.every((edge) => edge.kind === "parallel") && routes.some((edge) => !edge.label?.trim())) {
      diagnostics.push({ severity: "warning", code: "UNLABELLED_SPLIT", message: `Split at '${node.id}' contains an unlabelled route.`, elements: [node.id] });
    }
  }

  const connected = new Set<string>();
  for (const edge of model.edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  for (const node of model.nodes) {
    if (model.nodes.length > 1 && !connected.has(node.id)) {
      diagnostics.push({ severity: "warning", code: "ISOLATED_NODE", message: `Node '${node.id}' is isolated.`, elements: [node.id] });
    }
  }

  if (model.nodes.length > 0 && !model.nodes.some((node) => (incomingCount.get(node.id) ?? 0) === 0 || node.type === "start" || node.type === "boundary")) {
    diagnostics.push(error("NO_ENTRY_NODE", "Process has no identifiable entry node."));
  }

  return { valid: diagnostics.every((item) => item.severity !== "error"), diagnostics };
}

function error(code: string, message: string, elements?: string[]): Diagnostic {
  const diagnostic: Diagnostic = { severity: "error", code, message };
  if (elements) diagnostic.elements = elements;
  return diagnostic;
}

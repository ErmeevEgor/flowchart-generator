import { parseProcessModel } from "../model/schemas.js";
import type { ProcessEdge, ProcessModel, ProcessNode } from "../model/processModel.js";

export interface ProcessExtractor {
  /** Called exactly once. Coordinates and visual styling must never be returned. */
  extract(text: string, instruction: string): Promise<unknown>;
}

export interface ParserOptions {
  extractor?: ProcessExtractor;
  title?: string;
}

export const EXTRACTION_INSTRUCTION = `Extract only facts explicitly stated in the source into a Process Model.
Return JSON with optional title and arrays nodes and edges. Node fields: id, type
(start|end|action|decision|boundary), text, optional role, system, document. Edge fields:
from, to, optional label, kind (main|alternative|return|parallel). Every real decision
must have at least two labelled outgoing edges. Do not invent steps, roles, systems,
documents, conditions, automation, or dependencies. Do not return coordinates or styles.`;

export async function parseProcessText(text: string, options: ParserOptions = {}): Promise<ProcessModel> {
  if (text.trim() === "") throw new Error("Input process description is empty.");
  if (options.extractor) {
    const extracted = await options.extractor.extract(text, EXTRACTION_INSTRUCTION);
    return parseProcessModel(extracted);
  }
  return parseDeterministically(text, options.title);
}

interface Tail {
  id: string;
  label?: string;
  kind?: ProcessEdge["kind"];
}

function parseDeterministically(text: string, title?: string): ProcessModel {
  const rawLines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^#{1,6}\s/.test(line));

  const nodes: ProcessNode[] = [];
  const edges: ProcessEdge[] = [];
  let tails: Tail[] = [];
  let counter = 0;
  let pendingDecision: string | undefined;
  let pendingBranches: Tail[] = [];

  const addNode = (type: ProcessNode["type"], source: string): ProcessNode => {
    const parsed = extractMetadata(cleanLine(source));
    const node: ProcessNode = { id: `n${++counter}`, type, text: parsed.text };
    if (parsed.role) node.role = parsed.role;
    if (parsed.system) node.system = parsed.system;
    if (parsed.document) node.document = parsed.document;
    nodes.push(node);
    return node;
  };

  const connectTails = (target: string): void => {
    for (const tail of tails) {
      const edge: ProcessEdge = { from: tail.id, to: target };
      if (tail.label) edge.label = tail.label;
      if (tail.kind) edge.kind = tail.kind;
      edges.push(edge);
    }
  };

  for (const line of rawLines) {
    const branch = pendingDecision ? cleanLine(line).match(/^(да|нет|иначе|есть[^:]*|нет[^:]*|вариант\s+[^:]+)\s*:\s*(.+)$/iu) : undefined;
    if (pendingDecision && branch) {
      const node = addNode("action", branch[2]!);
      const label = branch[1]!.trim();
      const kind: NonNullable<ProcessEdge["kind"]> = pendingBranches.length === 0 && /^(да|есть)/iu.test(label) ? "main" : "alternative";
      edges.push({ from: pendingDecision, to: node.id, label, kind });
      pendingBranches.push({ id: node.id, kind });
      continue;
    }

    if (pendingDecision) {
      tails = pendingBranches;
      pendingDecision = undefined;
      pendingBranches = [];
    }

    const parallel = cleanLine(line).match(/^параллельно\s*:\s*(.+)$/iu);
    if (parallel) {
      const actions = parallel[1]!.split("|").map((value) => value.trim()).filter(Boolean);
      if (actions.length < 2) throw new Error("A parallel line must contain at least two actions separated with '|'.");
      const branchNodes = actions.map((action) => addNode("action", action));
      for (const node of branchNodes) {
        for (const tail of tails) edges.push({ from: tail.id, to: node.id, kind: "parallel" });
      }
      tails = branchNodes.map((node) => ({ id: node.id, kind: "parallel" }));
      continue;
    }

    const inline = line.match(/^если\s+(.+?)[,;:]\s*то\s+(.+?)[,;]\s*иначе\s+(.+?)[.!]?$/iu);
    if (inline) {
      const condition = addNode("decision", ensureQuestion(inline[1]!));
      connectTails(condition.id);
      const yes = addNode("action", inline[2]!);
      const no = addNode("action", inline[3]!);
      edges.push(
        { from: condition.id, to: yes.id, label: "Да", kind: "main" },
        { from: condition.id, to: no.id, label: "Нет", kind: "alternative" },
      );
      tails = [{ id: yes.id, kind: "main" }, { id: no.id, kind: "alternative" }];
      continue;
    }

    const typed = classifyLine(line, nodes.length === 0);
    const node = addNode(typed.type, typed.text);
    connectTails(node.id);
    if (typed.type === "decision") {
      pendingDecision = node.id;
      pendingBranches = [];
      tails = [];
    } else {
      tails = [{ id: node.id, kind: "main" }];
    }
  }

  if (pendingDecision) tails = pendingBranches;

  if (nodes.length === 0) throw new Error("No process steps were found in the input.");
  const model: ProcessModel = { nodes, edges };
  if (title) model.title = title;
  return model;
}

function cleanLine(line: string): string {
  return line
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function classifyLine(line: string, first: boolean): { type: ProcessNode["type"]; text: string } {
  const cleaned = cleanLine(line);
  const match = cleaned.match(/^(начало|старт|завершение|конец|условие|из процесса|в процесс)\s*:\s*(.+)$/iu);
  if (match) {
    const marker = match[1]!.toLocaleLowerCase("ru-RU");
    const text = match[2]!.trim();
    if (marker === "начало" || marker === "старт") return { type: "start", text };
    if (marker === "конец" || marker === "завершение") return { type: "end", text };
    if (marker === "условие") return { type: "decision", text: ensureQuestion(text) };
    return { type: "boundary", text: `${match[1]}\n${text}` };
  }
  return { type: first ? "start" : "action", text: cleaned };
}

function ensureQuestion(text: string): string {
  const cleaned = text.trim().replace(/[?.!]+$/, "");
  return `${cleaned}?`;
}

function extractMetadata(source: string): { text: string; role?: string; system?: string; document?: string } {
  const metadata: Record<string, string> = {};
  const text = source.replace(/\s*[\[{(]\s*((?:(?:роль|role|система|system|документ|document)\s*[:=]\s*[^;\]}\)]+;?\s*)+)[\]})]\s*$/iu, (_all, body: string) => {
    for (const part of body.split(";")) {
      const pair = part.match(/^\s*(роль|role|система|system|документ|document)\s*[:=]\s*(.+?)\s*$/iu);
      if (!pair) continue;
      const key = pair[1]!.toLocaleLowerCase("ru-RU");
      const normalized = key === "роль" || key === "role" ? "role" : key === "система" || key === "system" ? "system" : "document";
      metadata[normalized] = pair[2]!;
    }
    return "";
  }).trim();

  const result: { text: string; role?: string; system?: string; document?: string } = { text };
  if (metadata.role) result.role = metadata.role;
  if (metadata.system) result.system = metadata.system;
  if (metadata.document) result.document = metadata.document;
  return result;
}

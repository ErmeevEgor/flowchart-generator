import assert from "node:assert/strict";
import test from "node:test";
import { generateProcessDiagram } from "../src/app/generator.js";
import { generateProcessBundle } from "../src/app/generator.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutProcess } from "../src/layout/layoutEngine.js";
import type { ProcessModel } from "../src/model/processModel.js";
import { parseProcessText } from "../src/parser/processParser.js";
import { renderDrawio } from "../src/render/drawioRenderer.js";
import { renderSvg } from "../src/render/svgRenderer.js";
import { routeEdges } from "../src/routing/edgeRouter.js";
import { detectEdgeIntersections } from "../src/routing/intersectionDetector.js";
import { validateGraph } from "../src/validation/graphValidator.js";
import { validateLayout } from "../src/validation/layoutValidator.js";
import { parseProcessBundle } from "../src/model/schemas.js";

test("long linear process stays on the central horizontal lane", async () => {
  const model = linearModel(20);
  const result = await generateProcessDiagram(model);
  assert.equal(result.layout.nodes.length, 20);
  assert.equal(new Set(result.layout.nodes.map((node) => node.lane)).size, 1);
  for (let index = 1; index < result.layout.nodes.length; index += 1) {
    assert.ok(result.layout.nodes[index]!.bounds.x > result.layout.nodes[index - 1]!.bounds.x);
  }
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);
});

test("several alternative branches receive separate lanes", async () => {
  const model = multipleAlternativesModel();
  const result = await generateProcessDiagram(model);
  const branches = ["main", "alt-a", "alt-b"].map((id) => result.layout.nodes.find((node) => node.id === id)!);
  assert.deepEqual(branches.map((node) => node.lane), [0, 1, 2]);
  assert.equal(new Set(branches.map((node) => node.bounds.y)).size, 3);
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);
});

test("alternative decision branch is placed below happy path and rejoins explicitly", async () => {
  const model = branchingModel();
  const result = await generateProcessDiagram(model);
  const decision = result.layout.nodes.find((node) => node.id === "decision")!;
  const main = result.layout.nodes.find((node) => node.id === "available")!;
  const alternative = result.layout.nodes.find((node) => node.id === "purchase")!;
  assert.equal(decision.lane, 0);
  assert.equal(main.lane, 0);
  assert.ok(alternative.lane > 0);
  assert.ok(alternative.bounds.y > main.bounds.y);
  assert.equal(result.layout.edges.filter((edge) => edge.to === "end").length, 2);
});

test("return edge is routed outside the node field", async () => {
  const model = returnModel();
  const nodeLayout = layoutProcess(model);
  const layout = routeEdges(model, nodeLayout);
  const returning = layout.edges.find((edge) => edge.kind === "return")!;
  const maxNodeBottom = Math.max(...layout.nodes.map((node) => node.bounds.y + node.bounds.height));
  assert.ok(returning.points.some((point) => point.y > maxNodeBottom));
  assert.equal(validateLayout(layout).diagnostics.filter((item) => item.severity === "error").length, 0);
});

test("fan-in and fan-out joins are not reported as edge intersections", () => {
  const intersections = detectEdgeIntersections([
    { id: "a", from: "decision", to: "left", kind: "main" as const, label: "Да", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] },
    { id: "b", from: "decision", to: "right", kind: "alternative" as const, label: "Нет", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -20 }] },
    { id: "c", from: "left", to: "merge", kind: "main" as const, points: [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 0 }] },
    { id: "d", from: "right", to: "merge", kind: "alternative" as const, points: [{ x: 20, y: -20 }, { x: 40, y: -20 }, { x: 40, y: 0 }] },
  ]);
  assert.deepEqual(intersections, []);
});

test("deterministic parser extracts metadata and one inline decision", async () => {
  const model = await parseProcessText(`
Начало: Получена заявка
Проверить заявку [роль: Менеджер; система: CRM]
Если данные верны, то Принять заявку, иначе Вернуть заявку
Конец: Обработка завершена
`);
  assert.equal(model.nodes.length, 6);
  assert.equal(model.nodes[1]!.role, "Менеджер");
  assert.equal(model.nodes[1]!.system, "CRM");
  const decision = model.nodes.find((node) => node.type === "decision")!;
  const routes = model.edges.filter((edge) => edge.from === decision.id);
  assert.deepEqual(routes.map((edge) => edge.label), ["Да", "Нет"]);
  assert.equal(validateGraph(model).valid, true);
});

test("text DSL supports multiline decisions and explicit parallel actions", async () => {
  const model = await parseProcessText(`
Начало: Заказ получен
Условие: Нужна дополнительная проверка
Да: Проверить оплату
Нет: Пропустить проверку
Продолжить обработку
Параллельно: Подготовить товар | Подготовить документы
Конец: Заказ подготовлен
`);
  const decision = model.nodes.find((node) => node.type === "decision")!;
  assert.equal(model.edges.filter((edge) => edge.from === decision.id).length, 2);
  assert.equal(model.edges.filter((edge) => edge.kind === "parallel").length, 4);
  assert.equal(validateGraph(model).valid, true);
  const result = await generateProcessDiagram(model);
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);
  assert.equal(result.diagnostics.filter((item) => item.code === "EDGE_INTERSECTION").length, 0);
});

test("invalid graph fails before rendering", () => {
  const invalid: ProcessModel = {
    nodes: [{ id: "d", type: "decision", text: "Продолжить?" }],
    edges: [{ from: "d", to: "missing" }],
  };
  const result = validateGraph(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item) => item.code === "UNKNOWN_EDGE_TARGET"));
  assert.ok(result.diagnostics.some((item) => item.code === "DECISION_WITHOUT_BRANCHES"));
});

test("SVG and draw.io exports contain editable nodes and directed edges", async () => {
  const result = await generateProcessDiagram(branchingModel());
  const svg = renderSvg(result.layout);
  const drawio = renderDrawio(result.layout);
  assert.match(svg, /marker-end="url\(#arrow\)"/);
  assert.match(svg, /<polygon class="node decision"/);
  assert.match(drawio, /<mxGraphModel/);
  assert.match(drawio, /edge="1"/);
  assert.match(drawio, /shape=rhombus/);
});

test("process bundle generates overview, subprocess diagrams, and manifest", async () => {
  const bundle = parseProcessBundle({
    title: "Обработка заказа",
    overview: {
      nodes: [
        { id: "start", type: "start", text: "Заказ получен" },
        { id: "pick", type: "action", text: "Отобрать товар" },
        { id: "end", type: "end", text: "Заказ отгружен" },
      ],
      edges: [
        { from: "start", to: "pick", kind: "main" },
        { from: "pick", to: "end", kind: "main" },
      ],
    },
    subprocesses: [{
      id: "pick-goods",
      overviewNodeId: "pick",
      title: "Отбор товара",
      process: branchingModel(),
    }],
  });
  const outputDirectory = await mkdtemp(join(tmpdir(), "schemes-generator-"));
  const result = await generateProcessBundle(bundle, { outputDirectory, basename: "order" });
  const overviewModel = JSON.parse(await readFile(result.overview.files!.model, "utf8")) as {
    nodes: Array<{ id: string; subprocess?: string }>;
  };
  const manifest = JSON.parse(await readFile(result.manifest, "utf8")) as {
    mode: string;
    subprocesses: Array<{ overviewNodeId: string; files: { drawio: string; svg: string } }>;
  };
  assert.equal(manifest.mode, "process_with_subprocesses");
  assert.equal(overviewModel.nodes.find((node) => node.id === "pick")!.subprocess, "Отбор товара");
  assert.equal(manifest.subprocesses[0]!.overviewNodeId, "pick");
  assert.equal(manifest.subprocesses[0]!.files.drawio, "subprocesses/pick-goods.drawio");
  assert.equal(manifest.subprocesses[0]!.files.svg, "subprocesses/pick-goods.svg");
});

test("process bundle rejects invented or missing subprocess boundaries", () => {
  assert.throws(() => parseProcessBundle({
    overview: branchingModel(),
    subprocesses: [],
  }), /at least one explicitly supported subprocess/);
  assert.throws(() => parseProcessBundle({
    overview: branchingModel(),
    subprocesses: [{ id: "missing", overviewNodeId: "unknown", process: branchingModel() }],
  }), /must reference an overview node/);
});

function linearModel(count: number): ProcessModel {
  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `n${index + 1}`,
      type: index === 0 ? "start" as const : index === count - 1 ? "end" as const : "action" as const,
      text: index === 0 ? "Процесс начат" : index === count - 1 ? "Процесс завершён" : `Выполнить шаг ${index}`,
    })),
    edges: Array.from({ length: count - 1 }, (_, index) => ({ from: `n${index + 1}`, to: `n${index + 2}`, kind: "main" as const })),
  };
}

function branchingModel(): ProcessModel {
  return {
    title: "Проверка наличия",
    nodes: [
      { id: "start", type: "start", text: "Получен заказ" },
      { id: "decision", type: "decision", text: "Товар есть на складе?" },
      { id: "available", type: "action", text: "Передать товар на склад" },
      { id: "purchase", type: "action", text: "Сформировать заказ поставщику" },
      { id: "confirm", type: "action", text: "Подтвердить срок поставки" },
      { id: "end", type: "end", text: "Заказ готов" },
    ],
    edges: [
      { from: "start", to: "decision", kind: "main" },
      { from: "decision", to: "available", label: "Да", kind: "main" },
      { from: "decision", to: "purchase", label: "Нет", kind: "alternative" },
      { from: "purchase", to: "confirm", kind: "alternative" },
      { from: "available", to: "end", kind: "main" },
      { from: "confirm", to: "end", kind: "alternative" },
    ],
  };
}

function returnModel(): ProcessModel {
  return {
    nodes: [
      { id: "start", type: "start", text: "Документ подготовлен" },
      { id: "review", type: "action", text: "Проверить документ" },
      { id: "decision", type: "decision", text: "Документ согласован?" },
      { id: "fix", type: "action", text: "Исправить замечания" },
      { id: "end", type: "end", text: "Документ согласован" },
    ],
    edges: [
      { from: "start", to: "review", kind: "main" },
      { from: "review", to: "decision", kind: "main" },
      { from: "decision", to: "end", label: "Да", kind: "main" },
      { from: "decision", to: "fix", label: "Нет", kind: "alternative" },
      { from: "fix", to: "review", label: "После исправления", kind: "return" },
    ],
  };
}

function multipleAlternativesModel(): ProcessModel {
  return {
    nodes: [
      { id: "start", type: "start", text: "Запрос получен" },
      { id: "decision", type: "decision", text: "Как обработать запрос?" },
      { id: "main", type: "action", text: "Обработать стандартно" },
      { id: "alt-a", type: "action", text: "Передать эксперту" },
      { id: "alt-b", type: "action", text: "Отклонить запрос" },
      { id: "end", type: "end", text: "Обработка завершена" },
    ],
    edges: [
      { from: "start", to: "decision", kind: "main" },
      { from: "decision", to: "main", label: "Стандартный", kind: "main" },
      { from: "decision", to: "alt-a", label: "Сложный", kind: "alternative" },
      { from: "decision", to: "alt-b", label: "Недопустимый", kind: "alternative" },
      { from: "main", to: "end", kind: "main" },
      { from: "alt-a", to: "end", kind: "alternative" },
      { from: "alt-b", to: "end", kind: "alternative" },
    ],
  };
}

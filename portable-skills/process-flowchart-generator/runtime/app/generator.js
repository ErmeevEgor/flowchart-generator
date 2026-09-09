import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { layoutProcess } from "../layout/layoutEngine.js";
import { renderDrawio } from "../render/drawioRenderer.js";
import { renderSvg } from "../render/svgRenderer.js";
import { routeEdges } from "../routing/edgeRouter.js";
import { validateGraph } from "../validation/graphValidator.js";
import { validateLayout } from "../validation/layoutValidator.js";
export async function generateProcessDiagram(model, options = {}) {
    const graphValidation = validateGraph(model);
    if (!graphValidation.valid)
        throw new Error(formatDiagnostics("Invalid Process Model", graphValidation.diagnostics));
    const nodeLayout = layoutProcess(model);
    const layout = routeEdges(model, nodeLayout);
    const layoutValidation = validateLayout(layout);
    const diagnostics = [...graphValidation.diagnostics, ...layoutValidation.diagnostics];
    if (!layoutValidation.valid)
        throw new Error(formatDiagnostics("Invalid diagram layout", layoutValidation.diagnostics));
    if (!options.outputDirectory)
        return { layout, diagnostics };
    await mkdir(options.outputDirectory, { recursive: true });
    const basename = sanitizeBasename(options.basename ?? "process");
    const files = {
        model: join(options.outputDirectory, `${basename}.json`),
        drawio: join(options.outputDirectory, `${basename}.drawio`),
        svg: join(options.outputDirectory, `${basename}.svg`),
        layout: join(options.outputDirectory, `${basename}.layout.json`),
    };
    await Promise.all([
        writeFile(files.model, `${JSON.stringify(model, null, 2)}\n`, "utf8"),
        writeFile(files.drawio, renderDrawio(layout), "utf8"),
        writeFile(files.svg, renderSvg(layout), "utf8"),
        ...(options.writeLayout ? [writeFile(files.layout, `${JSON.stringify(layout, null, 2)}\n`, "utf8")] : []),
    ]);
    return { layout, diagnostics, files };
}
export async function generateProcessBundle(bundle, options) {
    const root = join(options.outputDirectory, sanitizeBasename(options.basename ?? bundle.title ?? "process"));
    const overviewDirectory = join(root, "overview");
    const subprocessDirectory = join(root, "subprocesses");
    const subprocessLabels = new Map(bundle.subprocesses.map((subprocess) => [
        subprocess.overviewNodeId,
        subprocess.title ?? subprocess.process.title ?? subprocess.id,
    ]));
    const overviewModel = {
        ...bundle.overview,
        nodes: bundle.overview.nodes.map((node) => {
            const subprocess = subprocessLabels.get(node.id);
            return subprocess ? { ...node, subprocess } : node;
        }),
    };
    const overview = await generateProcessDiagram(overviewModel, {
        outputDirectory: overviewDirectory,
        basename: "overview",
        writeLayout: Boolean(options.writeLayout),
    });
    const subprocesses = [];
    for (const subprocess of bundle.subprocesses) {
        const basename = sanitizeSubprocessId(subprocess.id);
        const model = subprocess.title && !subprocess.process.title
            ? { ...subprocess.process, title: subprocess.title }
            : subprocess.process;
        const result = await generateProcessDiagram(model, {
            outputDirectory: subprocessDirectory,
            basename,
            writeLayout: Boolean(options.writeLayout),
        });
        subprocesses.push({ id: subprocess.id, overviewNodeId: subprocess.overviewNodeId, result });
    }
    const manifest = join(root, "manifest.json");
    const manifestValue = {
        schemaVersion: 1,
        mode: "process_with_subprocesses",
        title: bundle.title ?? bundle.overview.title ?? null,
        overview: manifestFiles(root, overview.files, Boolean(options.writeLayout)),
        subprocesses: bundle.subprocesses.map((subprocess, index) => ({
            id: subprocess.id,
            title: subprocess.title ?? subprocess.process.title ?? null,
            overviewNodeId: subprocess.overviewNodeId,
            files: manifestFiles(root, subprocesses[index].result.files, Boolean(options.writeLayout)),
        })),
    };
    await writeFile(manifest, `${JSON.stringify(manifestValue, null, 2)}\n`, "utf8");
    return { root, manifest, overview, subprocesses };
}
function formatDiagnostics(title, diagnostics) {
    return `${title}:\n${diagnostics.map((item) => `- [${item.code}] ${item.message}`).join("\n")}`;
}
function sanitizeBasename(value) {
    const result = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim();
    return result || "process";
}
function sanitizeSubprocessId(value) {
    const result = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLocaleLowerCase();
    return result || "subprocess";
}
function manifestFiles(root, files, includeLayout) {
    return {
        model: normalizeManifestPath(relative(root, files.model)),
        drawio: normalizeManifestPath(relative(root, files.drawio)),
        svg: normalizeManifestPath(relative(root, files.svg)),
        ...(includeLayout ? { layout: normalizeManifestPath(relative(root, files.layout)) } : {}),
    };
}
function normalizeManifestPath(value) {
    return value.replace(/\\/g, "/");
}
//# sourceMappingURL=generator.js.map
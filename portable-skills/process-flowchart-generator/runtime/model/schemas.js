import { NODE_TYPES, } from "./processModel.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
export function parseProcessModel(value) {
    if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
        throw new Error("Process Model must contain arrays 'nodes' and 'edges'.");
    }
    const nodes = value.nodes.map((item, index) => {
        if (!isRecord(item))
            throw new Error(`nodes[${index}] must be an object.`);
        if (typeof item.id !== "string" || item.id.trim() === "") {
            throw new Error(`nodes[${index}].id must be a non-empty string.`);
        }
        if (typeof item.type !== "string" || !NODE_TYPES.includes(item.type)) {
            throw new Error(`nodes[${index}].type is not supported.`);
        }
        if (typeof item.text !== "string")
            throw new Error(`nodes[${index}].text must be a string.`);
        const node = {
            id: item.id,
            type: item.type,
            text: item.text,
        };
        for (const field of ["role", "system", "document", "subprocess"]) {
            if (item[field] !== undefined) {
                if (typeof item[field] !== "string")
                    throw new Error(`nodes[${index}].${field} must be a string.`);
                node[field] = item[field];
            }
        }
        return node;
    });
    const edges = value.edges.map((item, index) => {
        if (!isRecord(item))
            throw new Error(`edges[${index}] must be an object.`);
        if (typeof item.from !== "string" || typeof item.to !== "string") {
            throw new Error(`edges[${index}] must contain string 'from' and 'to'.`);
        }
        const edge = { from: item.from, to: item.to };
        if (item.id !== undefined) {
            if (typeof item.id !== "string")
                throw new Error(`edges[${index}].id must be a string.`);
            edge.id = item.id;
        }
        if (item.label !== undefined) {
            if (typeof item.label !== "string")
                throw new Error(`edges[${index}].label must be a string.`);
            edge.label = item.label;
        }
        if (item.kind !== undefined) {
            const kinds = ["main", "alternative", "return", "parallel"];
            if (typeof item.kind !== "string" || !kinds.includes(item.kind)) {
                throw new Error(`edges[${index}].kind is not supported.`);
            }
            edge.kind = item.kind;
        }
        return edge;
    });
    const model = { nodes, edges };
    if (value.title !== undefined) {
        if (typeof value.title !== "string")
            throw new Error("title must be a string.");
        model.title = value.title;
    }
    return model;
}
export function parseProcessBundle(value) {
    if (!isRecord(value) || value.overview === undefined || !Array.isArray(value.subprocesses)) {
        throw new Error("Process Bundle must contain 'overview' and array 'subprocesses'.");
    }
    const overview = parseProcessModel(value.overview);
    const overviewNodeIds = new Set(overview.nodes.map((node) => node.id));
    const ids = new Set();
    const fileIds = new Set();
    const subprocesses = value.subprocesses.map((item, index) => {
        if (!isRecord(item))
            throw new Error(`subprocesses[${index}] must be an object.`);
        if (typeof item.id !== "string" || item.id.trim() === "") {
            throw new Error(`subprocesses[${index}].id must be a non-empty string.`);
        }
        if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i.test(item.id)) {
            throw new Error(`subprocesses[${index}].id must use Latin letters, digits, dots, underscores, or hyphens.`);
        }
        if (ids.has(item.id))
            throw new Error(`Subprocess id '${item.id}' is duplicated.`);
        ids.add(item.id);
        const fileId = sanitizeFileId(item.id);
        if (fileIds.has(fileId))
            throw new Error(`Subprocess id '${item.id}' collides with another file name.`);
        fileIds.add(fileId);
        if (typeof item.overviewNodeId !== "string" || !overviewNodeIds.has(item.overviewNodeId)) {
            throw new Error(`subprocesses[${index}].overviewNodeId must reference an overview node.`);
        }
        if (item.process === undefined)
            throw new Error(`subprocesses[${index}].process is required.`);
        const subprocess = {
            id: item.id,
            overviewNodeId: item.overviewNodeId,
            process: parseProcessModel(item.process),
        };
        if (item.title !== undefined) {
            if (typeof item.title !== "string" || item.title.trim() === "") {
                throw new Error(`subprocesses[${index}].title must be a non-empty string.`);
            }
            subprocess.title = item.title;
        }
        return subprocess;
    });
    if (subprocesses.length === 0) {
        throw new Error("process_with_subprocesses mode requires at least one explicitly supported subprocess.");
    }
    const bundle = { overview, subprocesses };
    if (value.title !== undefined) {
        if (typeof value.title !== "string")
            throw new Error("title must be a string.");
        bundle.title = value.title;
    }
    return bundle;
}
function sanitizeFileId(value) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLocaleLowerCase() || "subprocess";
}
//# sourceMappingURL=schemas.js.map
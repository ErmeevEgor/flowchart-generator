#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { generateProcessBundle, generateProcessDiagram } from "./generator.js";
import { parseProcessBundle, parseProcessModel } from "../model/schemas.js";
import { parseProcessText } from "../parser/processParser.js";
import type { GenerationMode } from "../model/processModel.js";

interface CliOptions {
  input: string;
  output: string;
  name?: string;
  title?: string;
  layout: boolean;
  mode: GenerationMode;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = resolve(options.input);
  const source = await readFile(inputPath, "utf8");
  const extension = extname(inputPath).toLocaleLowerCase();
  if (options.mode === "process_with_subprocesses") {
    if (extension !== ".json") {
      throw new Error("process_with_subprocesses mode requires a Process Bundle JSON file.");
    }
    const bundle = parseProcessBundle(JSON.parse(source) as unknown);
    const result = await generateProcessBundle(bundle, {
      outputDirectory: resolve(options.output),
      basename: options.name ?? basename(inputPath, extension),
      writeLayout: options.layout,
    });
    console.log(`Generated overview and ${result.subprocesses.length} subprocess diagram(s).`);
    console.log(`Manifest: ${result.manifest}`);
    console.log(`Root:     ${result.root}`);
    return;
  }
  const model = extname(inputPath).toLocaleLowerCase() === ".json"
    ? parseProcessModel(JSON.parse(source) as unknown)
    : await parseProcessText(source, options.title ? { title: options.title } : {});
  const inferredName = basename(inputPath, extname(inputPath));
  const generationOptions = {
    outputDirectory: resolve(options.output),
    basename: options.name ?? inferredName,
    writeLayout: options.layout,
  };
  const result = await generateProcessDiagram(model, generationOptions);
  const warnings = result.diagnostics.filter((item) => item.severity === "warning");

  console.log(`Generated ${model.nodes.length} nodes and ${model.edges.length} edges.`);
  console.log(`Process Model: ${result.files!.model}`);
  console.log(`draw.io:       ${result.files!.drawio}`);
  console.log(`SVG:           ${result.files!.svg}`);
  if (options.layout) console.log(`Layout JSON:   ${result.files!.layout}`);
  if (warnings.length > 0) {
    console.warn(`Geometry warnings (${warnings.length}):`);
    for (const warning of warnings) console.warn(`- [${warning.code}] ${warning.message}`);
  }
}

function parseArguments(args: string[]): CliOptions {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: schemes-generator <process.txt|process.json> [options]

Options:
  --out <directory>  Output directory (default: output)
  --name <basename>  Output file basename (default: input filename)
  --title <title>    Diagram title for text input
  --mode <mode>      process_only (default) or process_with_subprocesses
  --layout           Also write routed layout JSON
  -h, --help         Show this help`);
    process.exit(0);
  }
  let input = "process.txt";
  let output = "output";
  let name: string | undefined;
  let title: string | undefined;
  let layout = false;
  let mode: GenerationMode = "process_only";
  let positionalSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--layout") {
      layout = true;
    } else if (arg === "--out" || arg === "--name" || arg === "--title" || arg === "--mode") {
      const value = args[++index];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") output = value;
      if (arg === "--name") name = value;
      if (arg === "--title") title = value;
      if (arg === "--mode") {
        if (value !== "process_only" && value !== "process_with_subprocesses") {
          throw new Error("--mode must be 'process_only' or 'process_with_subprocesses'.");
        }
        mode = value;
      }
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option '${arg}'.`);
    } else if (!positionalSeen) {
      input = arg;
      positionalSeen = true;
    } else {
      throw new Error(`Unexpected argument '${arg}'.`);
    }
  }
  const result: CliOptions = { input, output, layout, mode };
  if (name) result.name = name;
  if (title) result.title = title;
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

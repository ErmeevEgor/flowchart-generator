#!/usr/bin/env python3
"""Verify the portable skill and smoke-test both generation modes."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent
REQUIRED = (
    "SKILL.md",
    "agents/openai.yaml",
    "references/modes.md",
    "references/process-model.md",
    "references/runtime.md",
    "runtime/package.json",
    "runtime/app/cli.js",
)
FORBIDDEN_PARTS = {"node_modules", "__pycache__", ".pytest_cache"}
FORBIDDEN_TEXT = (
    "arman-" + "bpmn-generator",
    "bpmn-" + "from-protocol",
    "D:" + "\\ClaudeProjects",
    "C:" + "\\Users",
)


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")


def verify_files() -> None:
    missing = [name for name in REQUIRED if not (SKILL_ROOT / name).is_file()]
    if missing:
        raise RuntimeError(f"Missing required files: {', '.join(missing)}")
    for path in SKILL_ROOT.rglob("*"):
        if any(part in FORBIDDEN_PARTS for part in path.parts):
            raise RuntimeError(f"Forbidden packaged path: {path.relative_to(SKILL_ROOT)}")
        if path.is_file() and path.suffix.lower() in {".md", ".yaml", ".json", ".js", ".py"}:
            text = path.read_text(encoding="utf-8")
            for forbidden in FORBIDDEN_TEXT:
                if forbidden in text:
                    raise RuntimeError(f"Non-portable reference '{forbidden}' in {path.relative_to(SKILL_ROOT)}")


def smoke_test() -> None:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js 20+ is required.")
    run([node, str(SKILL_ROOT / "runtime/app/cli.js"), "--help"])
    process = {
        "title": "Smoke process",
        "nodes": [
            {"id": "n1", "type": "start", "text": "Request received"},
            {"id": "n2", "type": "end", "text": "Request completed"},
        ],
        "edges": [{"from": "n1", "to": "n2", "kind": "main"}],
    }
    bundle = {
        "title": "Smoke bundle",
        "overview": process,
        "subprocesses": [{
            "id": "request-processing",
            "overviewNodeId": "n2",
            "title": "Request processing",
            "process": process,
        }],
    }
    with tempfile.TemporaryDirectory(prefix="flowchart-skill-") as temp_value:
        temp = Path(temp_value)
        process_file = temp / "process.json"
        bundle_file = temp / "bundle.json"
        process_file.write_text(json.dumps(process), encoding="utf-8")
        bundle_file.write_text(json.dumps(bundle), encoding="utf-8")
        run([node, str(SKILL_ROOT / "runtime/app/cli.js"), str(process_file), "--mode", "process_only", "--out", str(temp / "single")])
        run([node, str(SKILL_ROOT / "runtime/app/cli.js"), str(bundle_file), "--mode", "process_with_subprocesses", "--out", str(temp / "detailed")])
        expected = (
            temp / "single/process.drawio",
            temp / "single/process.svg",
            temp / "detailed/bundle/manifest.json",
            temp / "detailed/bundle/overview/overview.drawio",
            temp / "detailed/bundle/subprocesses/request-processing.svg",
        )
        missing = [str(path) for path in expected if not path.is_file()]
        if missing:
            raise RuntimeError(f"Smoke test outputs are missing: {', '.join(missing)}")


def main() -> int:
    verify_files()
    smoke_test()
    print(f"PASS: portable skill verified at {SKILL_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

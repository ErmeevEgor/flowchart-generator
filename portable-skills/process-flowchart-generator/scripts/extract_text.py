#!/usr/bin/env python3
"""Extract readable source text without third-party Python packages."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree


WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{WORD_NAMESPACE}}}"


def read_text(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"Unable to decode text file: {path}")


def paragraph_text(element: ElementTree.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        if node.tag == f"{W}t":
            parts.append(node.text or "")
        elif node.tag in {f"{W}tab", f"{W}br", f"{W}cr"}:
            parts.append(" ")
    return "".join(parts).strip()


def extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        try:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
        except KeyError as error:
            raise RuntimeError(f"Not a valid DOCX document: {path}") from error

    body = root.find(f"{W}body")
    if body is None:
        return ""
    lines: list[str] = []
    for child in body:
        if child.tag == f"{W}p":
            value = paragraph_text(child)
            if value:
                lines.append(value)
        elif child.tag == f"{W}tbl":
            for row in child.findall(f"{W}tr"):
                cells = [paragraph_text(cell) for cell in row.findall(f"{W}tc")]
                if any(cells):
                    lines.append(" | ".join(cells))
    return "\n".join(lines)


def extract_with_command(path: Path, command: str) -> str:
    executable = shutil.which(command)
    if not executable:
        raise RuntimeError(f"{command} is required to extract {path.suffix} files in this environment.")
    if command == "pdftotext":
        completed = subprocess.run([executable, str(path), "-"], check=True, capture_output=True)
        return completed.stdout.decode("utf-8", errors="replace")
    with tempfile.TemporaryDirectory(prefix="flowchart-extract-") as temp:
        completed = subprocess.run(
            [executable, "--headless", "--convert-to", "txt:Text", "--outdir", temp, str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        target = Path(temp) / f"{path.stem}.txt"
        if not target.exists():
            raise RuntimeError(completed.stderr.strip() or "LibreOffice did not create a text file.")
        return read_text(target)


def extract(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".tsv", ".json"}:
        return read_text(path)
    if suffix == ".docx":
        return extract_docx(path)
    if suffix == ".doc":
        return extract_with_command(path, "soffice")
    if suffix == ".pdf":
        return extract_with_command(path, "pdftotext")
    raise RuntimeError(f"Unsupported input type '{suffix}'. Use a host-native reader or convert the file to DOCX/TXT.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    source = args.input.expanduser().resolve()
    if not source.is_file():
        parser.error(f"Input file does not exist: {source}")
    value = extract(source).strip() + "\n"
    if args.output:
        target = args.output.expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding="utf-8")
    else:
        sys.stdout.write(value)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

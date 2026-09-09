#!/usr/bin/env python3
"""Verify the packaged ZIP, its checksum, and its extracted runtime."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parent.parent
RELEASE = json.loads((REPOSITORY / "portable-skills" / "process-flowchart-generator" / "release.json").read_text(encoding="utf-8"))
ARCHIVE = REPOSITORY / "release" / f"{RELEASE['name']}-{RELEASE['version']}.zip"
CHECKSUM = ARCHIVE.with_suffix(f"{ARCHIVE.suffix}.sha256")


def main() -> int:
    actual = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    recorded = CHECKSUM.read_text(encoding="ascii").split()[0]
    if actual != recorded:
        raise RuntimeError("SHA256 mismatch")
    with tempfile.TemporaryDirectory(prefix="flowchart-release-") as temp_value:
        temp = Path(temp_value)
        with zipfile.ZipFile(ARCHIVE) as bundle:
            members = bundle.namelist()
            if any(Path(member).is_absolute() or ".." in Path(member).parts for member in members):
                raise RuntimeError("Archive contains an unsafe path")
            bundle.extractall(temp)
        skill = temp / "process-flowchart-generator"
        subprocess.run([sys.executable, str(skill / "scripts" / "verify_package.py")], check=True)
        file_count = sum(1 for path in skill.rglob("*") if path.is_file())
    print(f"PASS: {ARCHIVE}")
    print(f"Files: {file_count}")
    print(f"Bytes: {ARCHIVE.stat().st_size}")
    print(f"SHA256: {actual}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

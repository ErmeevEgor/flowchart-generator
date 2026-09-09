#!/usr/bin/env python3
"""Build the portable Agent Skill runtime and reproducible ZIP archive."""

from __future__ import annotations

import json
import hashlib
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parent.parent
SKILL = REPOSITORY / "portable-skills" / "process-flowchart-generator"
SOURCE_RUNTIME = REPOSITORY / "dist" / "src"
TARGET_RUNTIME = SKILL / "runtime"
RELEASE_DIRECTORY = REPOSITORY / "release"


def ensure_inside_repository(path: Path) -> None:
    path.resolve().relative_to(REPOSITORY.resolve())


def run(command: list[str]) -> None:
    command_name = "npm.cmd" if os.name == "nt" and command[0] == "npm" else command[0]
    executable = shutil.which(command_name)
    if not executable:
        raise RuntimeError(f"Required executable is not available: {command[0]}")
    subprocess.run([executable, *command[1:]], cwd=REPOSITORY, check=True)


def sync_runtime() -> None:
    ensure_inside_repository(TARGET_RUNTIME)
    package_file = TARGET_RUNTIME / "package.json"
    package_value = package_file.read_text(encoding="utf-8")
    for child in TARGET_RUNTIME.iterdir():
        if child.name == "package.json":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    for source in SOURCE_RUNTIME.rglob("*.js"):
        relative = source.relative_to(SOURCE_RUNTIME)
        target = TARGET_RUNTIME / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    package_file.write_text(package_value, encoding="utf-8")


def build_zip() -> Path:
    release = json.loads((SKILL / "release.json").read_text(encoding="utf-8"))
    archive = RELEASE_DIRECTORY / f"{release['name']}-{release['version']}.zip"
    RELEASE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for source in sorted(path for path in SKILL.rglob("*") if path.is_file()):
            relative = source.relative_to(SKILL.parent)
            info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, source.read_bytes())
    return archive


def write_checksum(archive: Path) -> Path:
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    target = archive.with_suffix(f"{archive.suffix}.sha256")
    target.write_text(f"{checksum}  {archive.name}\n", encoding="ascii")
    return target


def main() -> int:
    run(["npm", "run", "build"])
    sync_runtime()
    subprocess.run([sys.executable, str(SKILL / "scripts" / "verify_package.py")], cwd=REPOSITORY, check=True)
    archive = build_zip()
    checksum = write_checksum(archive)
    print(f"Built {archive}")
    print(f"Checksum {checksum}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

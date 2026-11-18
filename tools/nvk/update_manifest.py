"""Create a launcher-program manifest that deliberately excludes persistent data."""
import argparse
import hashlib
import json
import stat
from pathlib import Path

APPS = {
    "zzz": "YAAGL NVK - ZZZ.app",
    "gi": "YAAGL NVK - Genshin Impact.app",
    "hsr": "YAAGL NVK - Honkai Star Rail.app",
}
GAME_PATHS = [
    "launcher-data/dist", "launcher-data/sidecar", "launcher-data/src/icons",
    "launcher-data/neutralino.config.json", "Start YAAGL NVK.command",
    "Update YAAGL NVK.command", "update-launcher.js", "UPDATE-MANIFEST.json",
    "README.md", "YAAGL-LICENSE.txt", "LAUNCHER-BUILD.json",
]
TOP_PATHS = [
    "Update YAAGL NVK.command", "update-launcher.js", "UPDATE-MANIFEST.json",
    "README.md", "GUIDE.md", "YAAGL-LICENSE.txt", "COMBINED-BUILD.json",
]
TOP_OPTIONAL = ["REUSED-COMPONENTS.json", "REBUILT-COMPONENTS.json", "UPSTREAM-COMPONENTS.json"]


def write_manifest(root):
    root = root.resolve(strict=True)
    game = (root / "LAUNCHER-BUILD.json").is_file()
    record = json.loads((root / ("LAUNCHER-BUILD.json" if game else "COMBINED-BUILD.json")).read_text())
    groups = ([APPS[record["game"]]] + GAME_PATHS if game else
              TOP_PATHS + [name for name in TOP_OPTIONAL if (root / name).is_file()])
    entries = {}
    for name in groups:
        if name == "UPDATE-MANIFEST.json":
            continue
        path = root / name
        if not path.exists() and not path.is_symlink():
            raise ValueError("Missing update program artifact: " + name)
        for item in [path, *sorted(path.rglob("*"))] if path.is_dir() and not path.is_symlink() else [path]:
            relative = item.relative_to(root).as_posix()
            if any(part == ".DS_Store" or part.startswith("._") for part in item.relative_to(root).parts):
                raise ValueError("Finder metadata in update payload: " + relative)
            mode = stat.S_IMODE(item.lstat().st_mode)
            if item.is_symlink():
                if not item.resolve(strict=True).is_relative_to(root):
                    raise ValueError("Update symlink escapes its root: " + relative)
                entries[relative] = {"type": "symlink", "mode": mode, "target": str(item.readlink())}
            elif item.is_dir():
                entries[relative] = {"type": "directory", "mode": mode}
            elif item.is_file():
                with item.open("rb") as stream:
                    value = hashlib.file_digest(stream, "sha256").hexdigest()
                entries[relative] = {"type": "file", "mode": mode, "sha256": value}
            else:
                raise ValueError("Unsupported update artifact: " + relative)
    result = {"schema_version": 1, "kind": "game" if game else "combined",
              "version": record["version"], "program_paths": groups, "entries": entries}
    if game:
        config = json.loads((root / "launcher-data/neutralino.config.json").read_text())
        result.update(game=record["game"], region=record["region"], application_id=config["applicationId"])
    (root / "UPDATE-MANIFEST.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    write_manifest(parser.parse_args().root)

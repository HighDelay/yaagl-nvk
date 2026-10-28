#!/usr/bin/env python3
"""Combine fresh ZZZ/GI/HSR launcher builds without bundling any runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
for name in ("zzz", "gi", "hsr", "output"):
    parser.add_argument("--" + name, type=Path, required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
output = args.output.absolute()
if output.exists() or output.is_symlink():
    raise SystemExit("Use a new output directory")
sources = {game: getattr(args, game.lower()).resolve(strict=True) for game in ("ZZZ", "GI", "HSR")}
records = {}
for game, source in sources.items():
    if source == output.resolve() or source in output.resolve().parents:
        raise SystemExit("Output must be outside the source packages")
    record = json.loads((source / "LAUNCHER-BUILD.json").read_text())
    if record["game"] != game.lower() or record["source_diff"]:
        raise SystemExit("Use clean, matching game builds")
    if any((source / "launcher-data" / name).exists() for name in ("wineprefix-nvk", "nvk-state", "logs")):
        raise SystemExit("Use fresh builds without game prefixes or launcher/account state")
    if record["game_install_dir"] is not None:
        raise SystemExit("Release builds must let the recipient choose their game directory")
    for name, expected in record["files"].items():
        with (source / name).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise SystemExit("Changed launcher artifact: " + name)
    if any(record.get(name) for name in ("bundled_runtime", "bundled_wine", "bundled_dxvk")) or any((source / name).exists() for name in ("runtime", "wine-nvk", "dxvk-nvk")):
        raise SystemExit("Release archives must contain launchers only; use the installed driver runtime")
    records[game] = record

if (len({record["version"] for record in records.values()}) != 1
    or len({record["yaagl_revision"] for record in records.values()}) != 1
    or len({record["region"] for record in records.values()}) != 1):
    raise SystemExit("Use game builds from the same version, region and source revision")
output.mkdir(parents=True)
for game, source in sources.items():
    shutil.copytree(source, output / game, symlinks=True)
shutil.copyfile(repo / "LICENSE", output / "YAAGL-LICENSE.txt")
shutil.copyfile(repo / "docs/NVK.md", output / "GUIDE.md")
region = next(iter(records.values()))["region"]
(output / "README.md").write_text("""# YAAGL NVK — ZZZ, GI and HSR

Extract this entire folder. Open ZZZ, GI or HSR and use its Start YAAGL NVK.command.
Each launcher keeps its own prefix, settings, logs and caches. Choose your game installation directory
on first use; these builds contain no game files or account state.

Install HighDelay's matching NVIDIA driver first. The NVK backend requires
/Library/GPUBundles/nvmtl/wine, including its matched DXVK pair. The launcher
downloads and prepares the pinned Wine 11.0-1 build on first setup. This archive
contains no Wine, NVK or DXVK runtime, and there is no bundled renderer fallback.
Select Settings → Wine → NVIDIA NVK + DXVK (local, experimental).

ZZZ gameplay is verified on RTX 2060 SUPER / Tahoe 26.7.1. GI/HSR configurations
and builds exist, but their gameplay has not been qualified. These are global
builds. See GUIDE.md for setup, runtime checks, rollback and validation limits.
Driver dependency licenses and source records are in its Wine/NVK runtime.
Wine's download identity and installed hashes are recorded in wine-nvk/nvk-wine.json
inside each launcher's data folder after setup. No games are included.
""".replace("These are global\nbuilds.", "These are " + ("CN" if region == "cn" else "global") + "\nbuilds."))
record = {"version": next(iter(records.values()))["version"],
          "packaging_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
          "installed_provider": "/Library/GPUBundles/nvmtl/wine", "bundled_runtime": False, "games": records}
(output / "COMBINED-BUILD.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"root": str(output), "bundled_runtime": False, "games": list(records)}, indent=2))

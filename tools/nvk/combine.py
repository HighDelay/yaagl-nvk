#!/usr/bin/env python3
"""Combine fresh ZZZ/GI/HSR builds with one shared Wine/runtime copy."""
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
runtime_id = None
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
    runtime = source / "runtime"
    checked = json.loads(subprocess.check_output([str(runtime / "bin/nvk-runtime"), "check", str(runtime)], text=True))
    runtime_id = runtime_id or checked["runtime_id"]
    if checked["runtime_id"] != runtime_id:
        raise SystemExit("All three packages must use the same runtime identity")
    records[game] = record

output.mkdir(parents=True)
copied = subprocess.run(["/bin/cp", "-cR", str(sources["ZZZ"] / "runtime"), str(output / "runtime")], capture_output=True)
if copied.returncode:
    if (output / "runtime").exists():
        shutil.rmtree(output / "runtime")
    shutil.copytree(sources["ZZZ"] / "runtime", output / "runtime", symlinks=True)
for game, source in sources.items():
    shutil.copytree(source, output / game, symlinks=True,
                    ignore=lambda folder, names: {"runtime"} if Path(folder) == source else set())
    # Keep each wrapper, state directory and existing nvk-runtime link intact.
    # Only its sibling runtime directory becomes a link to the common copy.
    (output / game / "runtime").symlink_to("../runtime", target_is_directory=True)
shutil.copyfile(repo / "LICENSE", output / "YAAGL-LICENSE.txt")
shutil.copyfile(repo / "docs/NVK.md", output / "GUIDE.md")
(output / "README.md").write_text("""# YAAGL NVK — ZZZ, GI and HSR

Extract this entire folder. Open ZZZ, GI or HSR and use its Start YAAGL NVK.command.
Keep the shared runtime folder beside all three game folders. Each launcher keeps
its own prefix, settings, logs and caches. Choose your game installation directory
on first use; these builds contain no game files or account state.

Install HighDelay's matching NVIDIA driver first. The NVK backend prefers
/Library/GPUBundles/nvmtl/wine, retaining the compatible bundled Wine executable.
It falls back to the bundled renderer only when that driver directory is absent.
Select Settings → Wine → NVIDIA NVK + DXVK (local, experimental).

ZZZ gameplay is verified on RTX 2060 SUPER / Tahoe 26.7.1. GI/HSR configurations
and builds exist, but their gameplay has not been qualified. These are global
builds. See GUIDE.md for setup, runtime checks, rollback and validation limits.
Dependency licenses and source/archive records are in runtime/LICENSES and its
nvk-wine-runtime.json. This bundle does not include the games themselves.
""")
record = {"packaging_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
          "runtime_id": runtime_id, "shared_runtime": "runtime", "games": records}
(output / "COMBINED-BUILD.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"root": str(output), "runtime_id": runtime_id, "games": list(records)}, indent=2))

#!/usr/bin/env python3
"""Build a game-specific YAAGL NVK app with private runtime and state folders."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

repo = Path(__file__).resolve().parents[2]
games = {
    "zzz": {"name": "ZZZ", "channel": "nap", "icon": "ZZZ_Bang.cr.png"},
    "gi": {"name": "Genshin Impact", "channel": "hk4e", "icon": "Paimon.cr.png"},
    "hsr": {"name": "Honkai Star Rail", "channel": "hkrpg", "icon": "March7th.cr.png"},
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--game", choices=games, required=True)
parser.add_argument("--region", choices=["global", "cn"], default="global")
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--runtime", type=Path, required=True)
parser.add_argument("--game-dir", type=Path)
args = parser.parse_args()
game = games[args.game]
channel = game["channel"] + ("os" if args.region == "global" else "cn")
root = args.output.resolve()
if root.exists():
    raise SystemExit("Output exists; use a new folder to preserve its prefix and game data")
runtime = args.runtime.resolve()
subprocess.run([str(runtime / "bin/nvk-runtime"), "check", str(runtime)], check=True)
for item in ["node_modules/.bin/vite", "bin/neutralino-mac_x64", "neutralino.js", "sidecar/sophon/SophonCLI"]:
    if not (repo / item).is_file():
        raise SystemExit("Missing " + item + "; run dependency/configuration/Sophon setup first")
environment = {**os.environ, "YAAGL_CHANNEL_CLIENT": channel, "YAAGL_VERSION": "development"}
subprocess.run([str(repo / "node_modules/.bin/vite"), "build", "--mode=development"], cwd=repo, env=environment, check=True)
root.mkdir(parents=True)
data = root / "launcher-data"
data.mkdir()
# Clone on APFS; ordinary copying also works on other writable macOS volumes.
copied = subprocess.run(["/bin/cp", "-cR", str(runtime), str(root / "runtime")], capture_output=True)
if copied.returncode:
    if (root / "runtime").exists():
        shutil.rmtree(root / "runtime")
    shutil.copytree(runtime, root / "runtime", symlinks=True)
# Finder may add metadata after a runtime was built. Strip it only from this
# fresh delivery copy; never mutate the source runtime or a running Wine tree.
delivery_runtime = root / "runtime"
removed = set()
for path in delivery_runtime.rglob("*"):
    if (path.name == ".DS_Store" or path.name.startswith("._")) and (path.is_file() or path.is_symlink()):
        removed.add(path.relative_to(delivery_runtime).as_posix())
        path.unlink()
if removed:
    sums = delivery_runtime / "SHA256SUMS"
    sums.write_text("".join(row + "\n" for row in sums.read_text().splitlines()
                            if row.partition("  ")[2] not in removed))
(data / "nvk-runtime").symlink_to("../runtime")
shutil.copytree(repo / "dist", data / "dist")
shutil.copyfile(repo / "neutralino.js", data / "dist/neutralino.js")
shutil.copytree(repo / "sidecar", data / "sidecar", symlinks=True,
                ignore=shutil.ignore_patterns("*.original", ".DS_Store"))
shutil.copytree(repo / "src/icons", data / "src/icons")
config = json.loads((repo / "neutralino.config.json").read_text())
config["applicationId"] = "com.highdelay.yaagl.nvk." + channel
config["version"] = "0.1.0"
config["modes"]["window"]["title"] = "YAAGL NVK — " + game["name"]
config["modes"]["window"]["icon"] = "/src/icons/" + game["icon"]
(data / "neutralino.config.json").write_text(json.dumps(config, indent=2) + "\n")
game_dir = str(args.game_dir.resolve()) if args.game_dir else None
storage = data / ".storage"
storage.mkdir()
initial = {"wine_state": "update", "wine_update_tag": "local-wine-11.0-dxvk-3.1.1-nvk",
           "wine_update_url": "local://nvk-runtime", "config_block_net": "false"}
if game_dir:
    initial["game_install_dir"] = game_dir
initial.update({"config_steam_patch": "true", "config_timeout_fix": "true"})
for key, value in initial.items():
    (storage / (key + ".neustorage")).write_text(value)
app_name = "YAAGL NVK - " + game["name"] + ".app"
app = root / app_name
mac = app / "Contents/MacOS"
mac.mkdir(parents=True)
(app / "Contents/Resources").mkdir()
shutil.copyfile(repo / "bin/neutralino-mac_x64", mac / "Yaagl")
(mac / "Yaagl").chmod(0o755)
wrapper = '''#!/bin/bash
set -eu
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "$script_dir/../.." && pwd)"
task_root="$(cd "$script_dir/../../.." && pwd)"
data_root="$task_root/launcher-data"
mkdir -p "$data_root/logs" "$data_root/nvk-state/tmp"
cd "$data_root"
export TMPDIR="$data_root/nvk-state/tmp"
export PATH_LAUNCH="$app_root"
exec "$script_dir/Yaagl" --path="$data_root" >> "$data_root/logs/launcher-console.log" 2>&1
'''
(mac / "parameterized").write_text(wrapper)
(mac / "parameterized").chmod(0o755)
info = {"CFBundleIdentifier": config["applicationId"], "CFBundleExecutable": "parameterized",
        "CFBundleName": "YAAGL NVK - " + game["name"], "CFBundlePackageType": "APPL",
        "CFBundleVersion": "0.1.0", "CFBundleShortVersionString": "0.1.0",
        "NSHighResolutionCapable": True, "LSMinimumSystemVersion": "15.5"}
(app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
subprocess.run(["codesign", "--force", "--deep", "--sign", "-", "--timestamp=none", str(app)], check=True)
start = root / "Start YAAGL NVK.command"
start.write_text('''#!/bin/bash
set -eu
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec /usr/bin/open "$task_root/''' + app_name + '''"
''')
start.chmod(0o755)
shutil.copyfile(repo / "LICENSE", root / "YAAGL-LICENSE.txt")
shutil.copyfile(repo / "docs/NVK.md", root / "README.md")
delivered = [*app.rglob("*"), *data.rglob("*"), start, root / "YAAGL-LICENSE.txt", root / "README.md"]
files = {}
for path in sorted(delivered):
    if path.is_file() and not path.is_symlink():
        with path.open("rb") as stream:
            files[str(path.relative_to(root))] = hashlib.file_digest(stream, "sha256").hexdigest()
record = {"game": args.game, "region": args.region, "channel": channel, "root": str(root),
          "application": str(app), "data_root": str(data), "game_install_dir": game_dir,
          "runtime_id": json.loads((runtime / "nvk-wine-runtime.json").read_text())["runtime_id"],
          "default_provider": "/Library/GPUBundles/nvmtl/wine", "provider_fallback": "bundled runtime only if installed provider is absent",
          "excluded_finder_metadata": sorted(removed),
          "yaagl_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
          "sophon_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo / "vendor/SophonClientv3", text=True).strip(),
          "source_diff": subprocess.check_output(["git", "diff", "--binary", "HEAD"], cwd=repo, text=True),
          "files": files, "validation": {"gameplay": "NOT RUN"}}
(root / "LAUNCHER-BUILD.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"root": str(root), "channel": channel, "application": str(app)}, indent=2))

#!/usr/bin/env python3
"""Build a game-specific YAAGL NVK app without bundling Wine or graphics runtimes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

repo = Path(__file__).resolve().parents[2]
version = "0.2.0"
games = {
    "zzz": {"name": "ZZZ", "channel": "nap", "icon": "ZZZ_Bang.cr.png"},
    "gi": {"name": "Genshin Impact", "channel": "hk4e", "icon": "Paimon.cr.png"},
    "hsr": {"name": "Honkai Star Rail", "channel": "hkrpg", "icon": "March7th.cr.png"},
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--game", choices=games, required=True)
parser.add_argument("--region", choices=["global", "cn"], default="global")
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--game-dir", type=Path)
args = parser.parse_args()
game = games[args.game]
channel = game["channel"] + ("os" if args.region == "global" else "cn")
root = args.output.resolve()
if root.exists():
    raise SystemExit("Output exists; use a new folder to preserve its prefix and game data")
for item in ["node_modules/.bin/vite", "bin/neutralino-mac_x64", "neutralino.js", "sidecar/sophon/SophonCLI"]:
    if not (repo / item).is_file():
        raise SystemExit("Missing " + item + "; run dependency/configuration/Sophon setup first")
environment = {**os.environ, "YAAGL_CHANNEL_CLIENT": channel, "YAAGL_VERSION": "development"}
subprocess.run([str(repo / "node_modules/.bin/vite"), "build", "--mode=development"], cwd=repo, env=environment, check=True)
root.mkdir(parents=True)
data = root / "launcher-data"
data.mkdir()
# The driver owns NVK/DXVK. Wine is downloaded and prepared on first setup.
# Release archives contain launchers, not a second graphics or Wine runtime.
shutil.copytree(repo / "dist", data / "dist")
shutil.copyfile(repo / "neutralino.js", data / "dist/neutralino.js")
shutil.copytree(repo / "sidecar", data / "sidecar", symlinks=True,
                ignore=shutil.ignore_patterns("*.original", ".DS_Store"))
shutil.copytree(repo / "src/icons", data / "src/icons")
config = json.loads((repo / "neutralino.config.json").read_text())
config["applicationId"] = "com.highdelay.yaagl.nvk." + channel
config["version"] = version
config["modes"]["window"]["title"] = "YAAGL NVK — " + game["name"]
config["modes"]["window"]["icon"] = "/src/icons/" + game["icon"]
(data / "neutralino.config.json").write_text(json.dumps(config, indent=2) + "\n")
game_dir = str(args.game_dir.resolve()) if args.game_dir else None
storage = data / ".storage"
storage.mkdir()
initial = {"wine_state": "update", "wine_update_tag": "driver-nvk-wine-11.0-1",
           "wine_update_url": "local://nvk-runtime", "config_block_net": "false"}
if game_dir:
    initial["game_install_dir"] = game_dir
workarounds = "true" if args.game == "zzz" else "false"
initial.update({"config_steam_patch": workarounds, "config_timeout_fix": workarounds})
for key, value in initial.items():
    (storage / (key + ".neustorage")).write_text(value)
app_name = "YAAGL NVK - " + game["name"] + ".app"
app = root / app_name
mac = app / "Contents/MacOS"
mac.mkdir(parents=True)
(app / "Contents/Resources").mkdir()
shutil.copyfile(repo / "bin/neutralino-mac_x64", mac / "Yaagl")
(mac / "Yaagl").chmod(0o755)
wrapper = (repo / "tools/nvk/launch-app.sh").read_text().replace("@APP_NAME@", app_name)
(mac / "parameterized").write_text(wrapper)
(mac / "parameterized").chmod(0o755)
info = {"CFBundleIdentifier": config["applicationId"], "CFBundleExecutable": "parameterized",
        "CFBundleName": "YAAGL NVK - " + game["name"], "CFBundlePackageType": "APPL",
        "CFBundleVersion": version, "CFBundleShortVersionString": version,
        "NSHighResolutionCapable": True, "LSMinimumSystemVersion": "15.5"}
(app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
subprocess.run(["codesign", "--force", "--deep", "--sign", "-", "--timestamp=none", str(app)], check=True)
start = root / "Start YAAGL NVK.command"
start.write_text((repo / "tools/nvk/start-launcher.sh").read_text().replace("@APP_NAME@", app_name))
start.chmod(0o755)
shutil.copyfile(repo / "LICENSE", root / "YAAGL-LICENSE.txt")
shutil.copyfile(repo / "docs/NVK.md", root / "README.md")
delivered = [*app.rglob("*"), *data.rglob("*"), start, root / "YAAGL-LICENSE.txt", root / "README.md"]
files = {}
for path in sorted(delivered):
    if path.is_file() and not path.is_symlink():
        with path.open("rb") as stream:
            files[str(path.relative_to(root))] = hashlib.file_digest(stream, "sha256").hexdigest()
record = {"version": version, "game": args.game, "region": args.region, "channel": channel, "root": str(root),
          "application": str(app), "data_root": str(data), "game_install_dir": game_dir,
          "default_provider": "/Library/GPUBundles/nvmtl/wine", "requires_installed_provider": True,
          "bundled_runtime": False, "bundled_wine": False, "bundled_dxvk": False,
          "yaagl_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
          "sophon_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo / "vendor/SophonClientv3", text=True).strip(),
          "source_diff": subprocess.check_output(["git", "diff", "--binary", "HEAD"], cwd=repo, text=True),
          "files": files, "validation": {"gameplay": "NOT RUN"}}
(root / "LAUNCHER-BUILD.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"root": str(root), "channel": channel, "application": str(app)}, indent=2))

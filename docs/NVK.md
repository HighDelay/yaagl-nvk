# YAAGL NVK

Native NVIDIA Vulkan for **Zenless Zone Zero, Genshin Impact and Honkai: Star Rail**,
including global/CN launch configurations, with [HighDelay's NVIDIA driver](https://github.com/HighDelay/nvidia-macos-driver).

```text
D3D11 game → DXVK → Wine Vulkan bridge → native NVK → NVIDIA GPU
```

Game rendering bypasses MoltenVK and NVMTL shader conversion. Wine, DXVK's
D3D11/SPIR-V conversion and NVK compilation remain. Completed frames use a GPU
copy into a macOS Metal drawable, with a CPU completion wait. Fewer layers do not
establish a measured FPS gain.

## Install

Requires Intel macOS **15.5+ / Tahoe**, a supported NVIDIA GPU and this fork's
matching driver **with the Wine/NVK runtime installed**.

1. Install the [driver package](https://github.com/HighDelay/nvidia-macos-driver/releases) and reboot.
2. Extract the YAAGL NVK archive. In the combined build, open `ZZZ/`, `GI/` or `HSR/`.
3. Open **Start YAAGL NVK.command** inside that game's folder. Keep the app and
   `launcher-data` together. The Start command passes the original location when
   macOS runs a downloaded app from a temporary, read-only location. If macOS
   blocks the command, allow that downloaded command in **System Settings →
   Privacy & Security → Open Anyway**, then open it again. Select **Settings →
   Wine → NVIDIA NVK + DXVK (local, experimental)**.
4. Setup verifies the installed driver runtime, downloads the pinned compatible
   Wine **11.0-1** archive, verifies its SHA-256 and prepares a private `wine-nvk`
   installation. It initializes its separate `wineprefix-nvk` and installs the
   driver's matched DXVK pair with original-file backups.
5. Choose/install the game directory and launch. D3D11, descriptor sets and the
   FPS/frame-time/device overlay are selected automatically. Use SDR and leave
   ReShade off for this backend.

**The launcher archive contains no Wine, NVK or DXVK runtime.** Both NVK and the
patched x64 `d3d11.dll` / `dxgi.dll` come from **`/Library/GPUBundles/nvmtl/wine`**.
There is no bundled provider fallback or separate DXVK download. To update DXVK,
update both DLLs in the driver runtime and regenerate its manifest/checksums;
YAAGL uses that installed pair. Close the game and restore the old DLL setup
before selecting a different pair.

Wine is downloaded directly from YAAGL's `wine-crossover-11.0-1-signed` release,
SHA-256 `89fa7e90fb626523a90d5867a03c6be785d017176739c6320a3b86c7838c3a35`.
Setup applies the launcher's existing Wine INF certificate fragment and re-signs
only the two private Wine loaders with `com.apple.security.get-task-allow`, as
required by the tested Tahoe task-port exchange. Installed files/hashes and the
vendor archive identity are recorded in `launcher-data/wine-nvk/nvk-wine.json`.
No ordinary Wine tree, CrossOver installation, macOS certificates, hosts file or
boot arguments change. The vendor release does not identify its exact CrossOver
patch revision; the launcher does not redistribute that binary archive.

The packages enable YAAGL's existing **Steam Patch** and **timeout fix** options.
The tested ZZZ profile needed both for its separate startup crash. HSR keeps its
Jadeite step inside the Steam launch route. ZZZ gameplay is verified on RTX 2060
SUPER / Tahoe 26.7.1; **GI/HSR gameplay is not qualified**.

## Rendering settings and logs

`dxvk.enableDescriptorBuffer = False` remains the default: descriptor buffers lost
ZZZ characters and HUD text; descriptor sets restored both. DXVK logs should say
`Binding model: Legacy`. FPS/device/frame-time HUD defaults to 1.25× scale.
Host `DXVK_HUD` and `DXVK_CONFIG` values are forwarded for diagnostics; `DXVK_HUD=0`
hides the overlay. Other Wine backends keep their existing settings.

Each launcher has separate data, prefix, caches and logs. Every game run records
`runtime.json` and DXVK logs beside its normal log in a `.nvk` folder. The record
identifies the installed provider and private Wine paths separately. Library logs
must identify the installed `libnvk_wine.dylib` and `libnvk_renderer.dylib`.
The runtime's `libMoltenVK.dylib` is an alias to its NVK frontend, not MoltenVK.
DXVK may emulate an AMD PCI vendor to a D3D11 app; check the underlying Vulkan
NVK/NVIDIA device rather than that emulated vendor alone.

## Restore

Quit the game and its Wine processes. From a game launcher's folder:

```sh
/Library/GPUBundles/nvmtl/wine/bin/nvk-runtime restore \
  /Library/GPUBundles/nvmtl/wine "$(pwd)/launcher-data/wineprefix-nvk"
```

The helper validates both originals before replacing either DLL. It refuses
unexpected modified DLLs/backups. The journal remains restorable after updating
the runtime. A byte-identical DLL pair may adopt a new runtime identity without
losing originals. Selecting another Wine distribution uses its ordinary prefix.

## Build

Configure dependencies, Neutralino and Sophon using YAAGL's build tooling. Use
Python 3.12+ and Xcode command line tools. Build each frontend sequentially because
Vite shares `dist/`. Fresh package folders are required; omit `--game-dir` for a
release so recipients choose their own game location.

```sh
python3 tools/nvk/package.py --game zzz --region global --output /absolute/new/YAAGL-NVK-ZZZ
python3 tools/nvk/package.py --game gi --region global --output /absolute/new/YAAGL-NVK-GI
python3 tools/nvk/package.py --game hsr --region global --output /absolute/new/YAAGL-NVK-HSR
python3 tools/nvk/combine.py \
  --zzz /absolute/new/YAAGL-NVK-ZZZ --gi /absolute/new/YAAGL-NVK-GI \
  --hsr /absolute/new/YAAGL-NVK-HSR --output /absolute/new/YAAGL-NVK-0.1.1
```

Use `--region cn` for CN builds. The combiner verifies fresh launcher file hashes
and excludes runtime, prefix and account state. Upstream self-updates remain
disabled until this fork has its own update channel. Do not release used launcher
folders or raw launcher console logs, which can include local RPC credentials.

## Validation

Backend tests cover all three games, provider validation, private prefixes,
native DLL overrides and the existing DXMT/Steam/Jadeite routes. TypeScript and
all three frontend builds are checked. Path tests cover absolute/relative data
locations, repeat resolution and file writes. Packaged-entry tests cover normal
and relocated app paths, including folder names with spaces. Native/Windows Vulkan GPU readbacks and
D3D11 presentation/depth/blend/shared-texture fallback probes pass on RTX 2060
SUPER / Tahoe. The optional `nvk-wine-setup.spec.ts` smoke test uses the pinned
cached vendor archive, real extraction/codesign/hash checks and a private folder;
it checks repeat setup, tamper detection and preservation of ordinary Wine.
Set `YAAGL_TEST_WINE_ARCHIVE` and a fresh `YAAGL_TEST_WINE_WORK` to run it.

These checks do not replace sustained gameplay, video/scene-transition and repeat
launch testing. GI/HSR still need actual gameplay tests. A controlled performance
comparison and commercial CrossOver qualification have not been done.

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

**The launcher archive contains no Wine or graphics runtime.** Both NVK and the
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

The ZZZ package enables YAAGL's existing **Steam Patch** and **timeout fix** options;
the tested ZZZ profile needed both for its separate startup crash. Both default
off for HSR and GI. HSR uses its ordinary Jadeite route, with the required `--`
separator before game arguments. An explicitly enabled Steam route also installs
its helpers. **Apply Recommended Settings** preserves an already selected NVK
profile and uses these game-specific defaults. Existing HSR/GI users can apply
those settings without replacing their NVK prefix.

ZZZ and HSR Global gameplay are confirmed on RTX 2060 SUPER / Tahoe 26.7.1,
including world rendering, characters and UI. HSR 4.6.0 was confirmed after this
startup repair, with Steam Patch and the timeout fix off. The supplied screenshots
show about 60 FPS; they are not a controlled performance comparison.
**GI and CN gameplay remain unqualified.**

## Rendering settings and logs

### ZZZ D3D12 and optional DLSS

**Settings → Game → DirectX 12 (vkd3d-proton)** is an explicit, default-off
choice for ZZZ, saved separately from D3DMetal. It requests `-use-d3d12` without
`-force-d3d11`. Turning it off returns to D3D11. HSR/GI keep their D3D11 routes.
The installed driver must contain the matched vkd3d-proton 3.1 `d3d12.dll` and
`d3d12core.dll`; DXGI still comes from the existing DXVK pair.

**DLSS support (experimental)** is a separate, default-off checkbox in the same
panel. It requires D3D12 and a provider containing the pinned NVIDIA Wine NGX
pair and DXVK-NVAPI. The driver's helper installs those DLLs with backups and
registers NGX in this launcher's private prefix using its matching Wine loader.
Then select DLSS Quality/Performance inside the game. Disabling this launcher
option restores only NGX/NVAPI and its original registry value before the next
launch, preserving D3D12/DXVK. Turn off DLSS in the game before doing so.

DLSSG is not forced on or blocked: the game/library keeps its normal hardware
checks. DLSS SR is user-confirmed on RTX 2060 SUPER; frame generation, ray
tracing and other GPUs remain unqualified. ZZZ's Steam Patch and timeout fix
remain enabled. Use the supplied Start command and normal Launch button; direct
Wine shortcuts missed the full preparation flow and crashed during diagnosis.

The D3D12 path is `D3D12 → vkd3d-proton → Wine Vulkan → native NVK → NVIDIA GPU`.
ZZZ D3D12 scenery, characters, UI and DLSS Quality/HUD were user-confirmed on
RTX 2060 SUPER / Tahoe 26.7.1. Native tests cover DXIL shaders, readback, fences,
120 presentations and resize; DLSS evaluated three frames with 4,680 checked
colour values and zero mismatches. These are correctness checks, not FPS gains.

**Driver dependency:** the new driver build is held at the user's request.
The currently published D3D11-only driver lacks D3D12/NGX components. This
launcher release still supports that driver's existing D3D11 path, and refuses
requested new features with an update message before modifying prefix DLLs.
It does not download a separate vkd3d/NGX runtime. After a matching driver is
built, its source-integrated helper still needs final compiled rollback tests.
For isolated testing, `YAAGL_NVK_RUNTIME_ROOT=/absolute/provider` selects a
validated provider; normal launches use `/Library/GPUBundles/nvmtl/wine`.

### HUD

Settings → General → **DXVK / NVK HUD** toggles the overlay for this backend
in normal settings and custom first setup. It defaults on and takes effect on
the next game launch. D3D11 uses the existing DXVK device/FPS/frame-time HUD;
D3D12 uses a native presentation FPS/ms box. It includes application stalls,
not just GPU time. The small cached bitmap is copied by the GPU, with a CPU
upload refreshed up to four times per second and no game-frame CPU readback.

When disabled, both `DXVK_HUD` and Wine-forwarded `WINE_NVK_HUD` are cleared.
Host `DXVK_HUD`/`NVK_HUD` values can customize the enabled path. Other Wine
backends keep their existing Metal HUD control.

### D3D11 settings

`dxvk.enableDescriptorBuffer = False` remains the default: descriptor buffers lost
ZZZ characters and HUD text; descriptor sets restored both. DXVK logs should say
`Binding model: Legacy`. FPS/device/frame-time HUD defaults to 1.25× scale.
Host `DXVK_CONFIG` values remain available for diagnostics. Other Wine backends
keep their existing Metal HUD control.

Each launcher has separate data, prefix, caches and logs. Every game run records
`runtime.json` and DXVK logs beside its normal log in a `.nvk` folder. D3D12
also records `vkd3d.log`, and `runtime.json` identifies the selected API and
vkd3d version. Caches remain in the launcher's private `nvk-state`. The record
identifies the installed provider and private Wine paths separately. Library logs
must identify the installed `libnvk_wine.dylib` and `libnvk_renderer.dylib`.
The runtime's `libMoltenVK.dylib` is an alias to its NVK frontend, not MoltenVK.
DXVK may emulate an AMD PCI vendor to a D3D11 app; check the underlying Vulkan
NVK/NVIDIA device rather than that emulated vendor alone.

## Restore

Quit the game and its Wine processes. From a game launcher's folder:

```sh
/Library/GPUBundles/nvmtl/wine/bin/nvk-runtime restore \
  /Library/GPUBundles/nvmtl/wine "$(pwd)/launcher-data/wineprefix-nvk" \
  "$(pwd)/launcher-data/wine-nvk/bin/wine"
```

The helper preflights all original DLL groups and the NGX registry value before
restoring them. The Wine argument is required when DLSS was installed; it may
be omitted on older D3D11-only helpers. It refuses
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
  --hsr /absolute/new/YAAGL-NVK-HSR --output /absolute/new/YAAGL-NVK-0.2.0
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
launch testing. GI and CN still need actual gameplay tests. A controlled performance
comparison and commercial CrossOver qualification have not been done.

# YAAGL NVK

This fork adds a native NVIDIA Vulkan backend for **Zenless Zone Zero, Genshin
Impact and Honkai: Star Rail**, in their global and CN channels. It uses the
Wine/NVK runtime maintained in [HighDelay's NVIDIA driver fork](https://github.com/HighDelay/nvidia-macos-driver).

```text
Windows D3D11 game → DXVK → Wine Vulkan → native NVK → NVIDIA GPU
```

Game rendering bypasses MoltenVK and NVMTL's Metal shader conversion. Wine still
supplies Windows compatibility and DXVK still translates D3D11/shaders to
Vulkan/SPIR-V. Metal supplies the macOS display drawable; presentation uses a GPU
copy and currently waits for its completion. It is not a zero-copy path, and fewer
translation layers do not establish an FPS gain.

The local packages include a DXVK shared-resource fallback repair and use legacy
descriptor sets. ZZZ world rendering, characters and FPS text were confirmed with
these settings on RTX 2060 SUPER / Tahoe 26.7.1. GI/HSR gameplay and sustained
stability/performance comparisons remain unqualified.

## Install and select

Requires Intel x86_64 macOS, a compatible installed NVIDIA driver, and the complete
matching Wine/NVK runtime. The renderer targets Sequoia 15.5 or newer; testing so far
is on Tahoe 26.7.1 / RTX 2060 SUPER.

1. Extract the complete game-specific launcher package. Keep its app,
   `launcher-data/` and `runtime/` together.
2. Open **Start YAAGL NVK.command** or its game-specific app.
3. Select **Settings → Wine → NVIDIA NVK + DXVK (local, experimental)**. Let the
   launcher initialize its own `wineprefix-nvk` prefix.
4. Download/select the game directory, then launch. Use SDR and leave ReShade off
   for this backend. D3D11 is forced; a saved D3D12 preference cannot override it.
   The new packages enable **Steam Patch** and **timeout fix** for all three game
   profiles. The tested ZZZ Wine 11.0-1 profile needed both to get past its separate
   startup crash. HSR retains its Jadeite launcher step inside the Steam route.
5. Check the DXVK HUD and logs. The actual Vulkan driver/device must identify
   NVK/NVIDIA and loaded-image paths must point to this runtime's two NVK libraries.

The NVK backend defaults to `dxvk.enableDescriptorBuffer = False`: the descriptor
buffer path rendered ZZZ's environment but lost characters and HUD text; switching
to descriptor sets restored both in the controlled game test. Logs should show
`Binding model: Legacy`. The underlying descriptor-buffer defect has not yet been
isolated, so this is a scoped compatibility setting rather than a Mesa repair.

The FPS, frame-time graph and device HUD are enabled at 1.25× scale by default.
For a diagnostic launch, host `DXVK_HUD` and `DXVK_CONFIG` values are forwarded;
explicit caller values take priority. `DXVK_HUD=0` disables HUD items. Other
graphics backends do not receive these NVK defaults.

Each packaged game has its own launcher-data directory, prefix, registry, logs and
caches. The same immutable runtime build can be copied into each package. Ordinary
YAAGL backends continue using their original prefix. No global Vulkan provider or
installed Minecraft runtime is replaced.

## Validation status

| Check | Result |
|---|---|
| Native and Windows Vulkan GPU fill/readback | PASS on RTX 2060 SUPER / Tahoe |
| Windows presentation, resize/minimize, two surfaces | PASS |
| DXVK 3.1.1 textured/depth/blended D3D11 probe | PASS, 300 presents and 11 readback checks |
| Actual game launch-program routing | Mocked tests cover all three games, native D3D11 arguments, existing DXMT behavior and all Steam routes, including HSR's Jadeite wrapper |
| ZZZ gameplay rendering | User confirms environment, characters and FPS HUD work with repaired DXVK, descriptor sets and Steam Patch/timeout options |
| GI and HSR gameplay | NOT RUN |
| Controlled FPS comparison | NOT RUN |

Channel wiring and a rendering probe do not qualify a game. Each title still
needs sustained gameplay, scene-transition, video and repeat-launch tests; GI and
HSR additionally need their first actual game-rendering test.
Existing non-graphics game startup/update workflows are retained.

## Logs and rollback

Each game run creates DXVK logs and a `runtime.json` beside its normal game log,
in a `.nvk` folder under `launcher-data/logs/`. Library startup output records the
actual provider. DXVK may expose an AMD PCI vendor to D3D11 as its normal NVIDIA
workaround; check its underlying Vulkan device log rather than that vendor alone.

Quit the game before changing backends. Select a previous Wine distribution to
return to its ordinary prefix. To restore the original DLLs in the NVK prefix:

```sh
./runtime/bin/nvk-runtime restore "$(pwd)/runtime" "$(pwd)/launcher-data/wineprefix-nvk"
```

Run that from the extracted package root after its Wine processes exit. Setup
journals and checks both originals before restoring either. Unexpected modified
DLLs or backups cause a refusal; leave them available for inspection. Runtime
integrity can be checked with `./runtime/bin/nvk-runtime check "$(pwd)/runtime"`.

Do not publish account state, prefixes or raw unfiltered launcher console logs.
The latter can include local RPC credentials. Release archives should be built
from fresh output folders, not from a launcher folder already used to sign in.

## Build game packages

First install the pinned pnpm dependencies, run `configure.sh` and build the
existing Sophon sidecar using YAAGL's build tooling. Supply the completed runtime
from the driver repository, including its DXVK 3.1.1 shared-resource fallback
repair. Stock DXVK 3.1.1 crashes when ZZZ probes shared textures without external
sharing. The driver repository carries the patch/build recipe, so a separate
DXVK fork is optional. Wine's binary code remains unchanged.

The driver's runtime builder accepts the same Wine INF prerequisite fragment used
by YAAGL's ordinary installer. After `configure.sh`, export it with:

```sh
node tools/nvk/export-wine-cert.cjs /absolute/new/yaagl-wine-cert.inf.fragment
```

Pass that output to the driver's `package.py --wine-cert-fragment ...`. This changes
only the private package's Windows registry setup, not macOS trust settings.

```sh
python3 tools/nvk/package.py --game zzz --region global \
  --runtime /absolute/nvk-wine-runtime --output /absolute/new/YAAGL-NVK-ZZZ \
  --game-dir /absolute/games/ZZZ
python3 tools/nvk/package.py --game gi --region global \
  --runtime /absolute/nvk-wine-runtime --output /absolute/new/YAAGL-NVK-GI \
  --game-dir /absolute/games/Genshin
python3 tools/nvk/package.py --game hsr --region global \
  --runtime /absolute/nvk-wine-runtime --output /absolute/new/YAAGL-NVK-HSR \
  --game-dir /absolute/games/StarRail
```

Use `--region cn` for CN channels. Each command builds that game's frontend and
creates a fresh app/data/runtime package. Run them sequentially because Vite's
`dist/` is shared. Existing output directories are refused. Use Python 3.12+ and
Xcode command line tools on Intel macOS. The local build disables YAAGL's upstream
self-updater; updates remain manual until this fork has its own update channel.

Tests: `pnpm exec vitest run src/wine/nvk*.spec.ts`, `pnpm exec tsc --noEmit`, plus
ESLint/Prettier on changed files. These tests mock game processes; validate each
real game before publishing a compatibility claim.

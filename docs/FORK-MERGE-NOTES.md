# YAAGL NVK merge notes

Keep the fork's launcher/provider contract when merging upstream:

- NVK, DXVK and optional VKD3D/NGX come from the installed driver-owned
  `/Library/GPUBundles/nvmtl/wine` provider. Launcher archives contain no Wine,
  graphics runtime, prefix, game files or account data. Wine downloads during setup.
- Preserve `WINEMSYNC=1` for setup, configuration, registry helpers, games and
  wineserver operations, including non-NVK Wine profiles.
- Preserve the selected NVK profile when applying recommended settings.
  Steam Patch and Timeout fix default on for ZZZ/GI and off for HSR; saved explicit
  choices survive updates. HSR retains its Jadeite route and argument separator.
  HSR Launch Fix (`config_block_net`) defaults on for Global/CN, including first
  setup and recommended settings; explicit saved choices survive ordinary loading.
- D3D11 stays the default. ZZZ's D3D12 and DLSS controls remain independent,
  default-off choices; retain provider capability checks, separate rollback
  journals, private registry originals and HUD controls.
- Retain absolute launcher data-path handling and the Start command's
  `--yaagl-root` argument. Production restarts must forward that original folder
  to the app wrapper after the old process exits, including relocated apps and
  paths containing spaces or apostrophes.
- Keep upstream quit/restart cleanup and HSR manifest-based installation
  detection. Download-folder checks must use directory boundaries, including
  normalized paths, while allowing unrelated folders with similar names.

Build Global and CN archives containing ZZZ, GI and HSR with `tools/nvk/`.
Record source identities and hashes for rebuilt/reused helpers. Keep public
manifests portable and raw local build logs outside the archives. Run unit,
TypeScript, lint, formatting and packaged-entry checks; validate signatures,
architectures, deployment targets, hashes and clean archive contents. Prepare a
draft release for review; application gameplay still needs separate confirmation.

import { join } from "path-browserify";
import { exec, fileOrDirExists, mkdirp, resolve, writeFile } from "@utils";
import type { Wine } from "./wine";
import { loadNVKWine } from "./nvk-wine";

export interface NVKRuntime {
  root: string;
  wineRoot: string;
  helper: string;
  wine: string;
  id: string;
  manifest: {
    schema_version: number;
    runtime_id: string;
    files: Record<string, string>;
  };
}

export const INSTALLED_NVK_ROOT = "/Library/GPUBundles/nvmtl/wine";

async function validateRuntime(root: string) {
  const manifestPath = join(root, "nvk-wine-runtime.json");
  if (!(await fileOrDirExists(manifestPath))) {
    throw new Error(
      "The NVIDIA NVK runtime is missing. Install this driver's Wine/NVK runtime at /Library/GPUBundles/nvmtl/wine before selecting this backend."
    );
  }
  const manifest = JSON.parse(
    await Neutralino.filesystem.readFile(manifestPath)
  );
  const helper = join(root, "bin/nvk-runtime");
  const expected = manifest.files?.["bin/nvk-runtime"];
  const hash = (await exec(["/usr/bin/shasum", "-a", "256", helper])).stdOut
    .trim()
    .split(/\s+/)[0];
  if (typeof expected !== "string" || hash !== expected) {
    throw new Error("The NVIDIA NVK setup tool failed its checksum check.");
  }
  await exec(["/usr/bin/codesign", "--verify", "--strict", helper]);
  const checked = JSON.parse((await exec([helper, "check", root])).stdOut);
  if (checked.result !== "PASS" || checked.runtime_id !== manifest.runtime_id) {
    throw new Error("The NVIDIA NVK runtime failed validation.");
  }
  return { root, helper, manifest, checked };
}

export async function loadNVKRuntime(
  root = INSTALLED_NVK_ROOT
): Promise<NVKRuntime> {
  const provider = await loadNVKProvider(root);
  const { wine, wineRoot } = await loadNVKWine();
  return {
    root: provider.root,
    wineRoot,
    helper: provider.helper,
    wine,
    id: provider.checked.runtime_id,
    manifest: provider.manifest,
  };
}

export async function loadNVKProvider(root = INSTALLED_NVK_ROOT) {
  root = resolve(root);
  const provider = await validateRuntime(root);
  if (provider.manifest.kind !== "provider") {
    throw new Error(
      "The installed NVIDIA NVK runtime must be a compact driver provider."
    );
  }
  return provider;
}

export async function initializeNVKState() {
  const state = resolve("./nvk-state");
  for (const name of [
    "tmp",
    "shader-cache",
    "cache",
    "config",
    "data",
    "logs",
  ]) {
    await mkdirp(join(state, name));
  }
  return state;
}

export async function prepareNVKPrefix(
  wine: Pick<Wine, "prefix" | "attributes">
) {
  const runtime = await loadNVKRuntime(wine.attributes.nvkRuntimeRoot);
  await exec([runtime.helper, "install", runtime.root, wine.prefix]);
  return runtime;
}

export async function prepareNVKGame(
  wine: Pick<Wine, "prefix" | "attributes">,
  gameDir: string,
  options: { reshade?: boolean; hdr?: boolean }
) {
  if (wine.attributes.renderBackend !== "dxvk-nvk") return;
  if (options.reshade) {
    throw new Error(
      "ReShade is not yet supported with the NVIDIA NVK backend."
    );
  }
  if (options.hdr) {
    throw new Error(
      "Disable HDR before using the NVIDIA NVK backend; this runtime supports SDR presentation."
    );
  }
  const runtime = await prepareNVKPrefix(wine);
  await checkNVKGameDirectory(runtime, gameDir);
}

export async function checkNVKGameDirectory(
  runtime: NVKRuntime,
  gameDir: string
) {
  const entries = await Neutralino.filesystem.readDirectory(gameDir);
  for (const entry of entries) {
    const name = entry.entry.toLowerCase();
    if (!["dxgi.dll", "d3d11.dll"].includes(name)) continue;
    const hash = (
      await exec(["/usr/bin/shasum", "-a", "256", join(gameDir, entry.entry)])
    ).stdOut
      .trim()
      .split(/\s+/)[0];
    if (hash !== runtime.manifest.files["dxvk/x64/" + name]) {
      throw new Error(
        `Disable the existing ${entry.entry} in the game folder before using NVIDIA NVK. The launcher has left that file unchanged.`
      );
    }
  }
}

export async function recordNVKLaunch(runtime: NVKRuntime, directory: string) {
  await mkdirp(directory);
  await writeFile(
    join(directory, "runtime.json"),
    JSON.stringify(
      {
        runtime_id: runtime.id,
        root: runtime.root,
        wine_root: runtime.wineRoot,
        wine: runtime.wine,
        files: runtime.manifest.files,
        backend: "dxvk-nvk",
        game_api: "D3D11",
      },
      null,
      2
    )
  );
}

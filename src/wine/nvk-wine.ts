import type { Aria2 } from "@aria2";
import type { CommonUpdateProgram } from "@common-update-ui";
import { join } from "path-browserify";
import {
  exec,
  fileOrDirExists,
  generateRandomString,
  humanFileSize,
  mkdirp,
  resolve,
  rmrf_dangerously,
  tar_extract_directory,
  writeFile,
} from "@utils";
import { addCertsToWine } from "./cert";

export const NVK_WINE = {
  url: "https://github.com/yaagl/anime-game-wine/releases/download/wine-crossover-11.0-1-signed/wine-crossover-11.0-1-osx64-signed.tar.xz",
  sha256: "89fa7e90fb626523a90d5867a03c6be785d017176739c6320a3b86c7838c3a35",
};
const WINE_FILES = [
  "bin/wine",
  "bin/wineserver",
  "lib/wine/x86_64-unix/wine",
  "share/wine/wine.inf",
  ...["ntdll", "win32u", "winemac", "winevulkan"].map(
    name => `lib/wine/x86_64-unix/${name}.so`
  ),
  ...[
    "ntdll",
    "kernel32",
    "kernelbase",
    "win32u",
    "vulkan-1",
    "winevulkan",
  ].map(name => `lib/wine/x86_64-windows/${name}.dll`),
];

async function hash(path: string): Promise<string> {
  const text = (
    await exec(["/usr/bin/shasum", "-a", "256", path])
  ).stdOut.trim();
  const match = /^\\?([0-9a-f]{64})\s/i.exec(text);
  if (!match) throw new Error("Could not hash NVK Wine artifact: " + path);
  return match[1].toLowerCase();
}

async function verifyWine(root: string) {
  const marker = JSON.parse(
    await Neutralino.filesystem.readFile(join(root, "nvk-wine.json"))
  );
  if (
    marker.schema_version !== 1 ||
    marker.archive_sha256 !== NVK_WINE.sha256 ||
    marker.url !== NVK_WINE.url
  ) {
    throw new Error(
      "The private Wine installation does not match its pinned release."
    );
  }
  for (const name of WINE_FILES) {
    const expected = marker.files?.[name];
    if (
      typeof expected !== "string" ||
      (await hash(join(root, name))) !== expected
    ) {
      throw new Error("NVK Wine checksum mismatch: " + join(root, name));
    }
  }
  for (const name of ["bin/wine", "lib/wine/x86_64-unix/wine"]) {
    await exec(["/usr/bin/codesign", "--verify", "--strict", join(root, name)]);
  }
}

export async function loadNVKWine() {
  const wineRoot = resolve("./wine-nvk");
  try {
    await verifyWine(wineRoot);
  } catch (error) {
    throw new Error(
      "Set up the NVIDIA NVK Wine distribution in Settings before launching. " +
        String(error)
    );
  }
  return { wineRoot, wine: join(wineRoot, "bin/wine") };
}

export async function* installNVKWine(aria2: Aria2): CommonUpdateProgram {
  const target = resolve("./wine-nvk");
  if (await fileOrDirExists(target)) {
    await verifyWine(target);
    return;
  }
  const state = resolve("./nvk-state/tmp");
  await mkdirp(state);
  const lock = resolve("./wine-nvk.install-lock");
  // Serialize competing setup windows without touching another Wine tree.
  await exec(["/bin/mkdir", lock]);
  const work = join(state, "wine-" + generateRandomString(16));
  const archive = join(work, "wine.tar.xz"),
    payload = join(work, "payload");
  try {
    if (await fileOrDirExists(target)) {
      await verifyWine(target);
      return;
    }
    await mkdirp(payload);
    yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
    for await (const progress of aria2.doStreamingDownload({
      uri: NVK_WINE.url,
      absDst: archive,
      checksum: "sha-256=" + NVK_WINE.sha256,
    })) {
      if (progress.totalLength > BigInt(0))
        yield [
          "setProgress",
          Number(
            (progress.completedLength * BigInt(100)) / progress.totalLength
          ),
        ];
      yield [
        "setStateText",
        "DOWNLOADING_ENVIRONMENT_SPEED",
        humanFileSize(Number(progress.downloadSpeed)),
      ];
    }
    if ((await hash(archive)) !== NVK_WINE.sha256)
      throw new Error("Downloaded Wine archive checksum mismatch");
    yield ["setStateText", "EXTRACT_ENVIRONMENT"];
    yield ["setUndeterminedProgress"];
    await tar_extract_directory(archive, payload, "wine", true);
    await addCertsToWine(payload);
    const entitlements = join(work, "task-port.plist");
    await writeFile(
      entitlements,
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>'
    );
    for (const name of ["bin/wine", "lib/wine/x86_64-unix/wine"]) {
      await exec([
        "/usr/bin/codesign",
        "--force",
        "--sign",
        "-",
        "--timestamp=none",
        "--entitlements",
        entitlements,
        join(payload, name),
      ]);
    }
    const files: Record<string, string> = {};
    for (const name of WINE_FILES)
      files[name] = await hash(join(payload, name));
    await writeFile(
      join(payload, "nvk-wine.json"),
      JSON.stringify(
        {
          schema_version: 1,
          url: NVK_WINE.url,
          archive_sha256: NVK_WINE.sha256,
          files,
        },
        null,
        2
      )
    );
    await verifyWine(payload);
    if (await fileOrDirExists(target))
      throw new Error(
        "A private Wine directory appeared during setup; left it unchanged."
      );
    await exec(["/bin/mv", payload, target]);
  } finally {
    await rmrf_dangerously(work);
    await rmrf_dangerously(lock);
  }
}

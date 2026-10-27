import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils", () => ({
  exec: vi.fn(),
  fileOrDirExists: vi.fn(),
  mkdirp: vi.fn(),
  writeFile: vi.fn(),
  resolve: (path: string) =>
    path.startsWith("/") ? path : "/bundle/nvk-runtime",
}));

import { exec, fileOrDirExists } from "@utils";
import { INSTALLED_NVK_ROOT, loadNVKRuntime, prepareNVKPrefix } from "./nvk";

const BUNDLE = "/bundle/nvk-runtime";
const installed = INSTALLED_NVK_ROOT;
let roots: Map<string, ReturnType<typeof manifest>>;

function manifest(root: string, provider = false) {
  return {
    schema_version: 1,
    runtime_id: provider ? "driver-provider" : "bundled-runtime",
    ...(provider ? { kind: "provider" } : {}),
    files: { "bin/nvk-runtime": "helper-hash" },
    ...(provider ? {} : { wine: { executable: root + "/wine/bin/wine" } }),
  };
}

describe("installed NVK provider and bundled Wine selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roots = new Map([
      [BUNDLE, manifest(BUNDLE)],
      [installed, manifest(installed, true)],
    ]);
    vi.mocked(fileOrDirExists).mockImplementation(async path =>
      roots.has(path.replace(/\/nvk-wine-runtime\.json$/, ""))
    );
    vi.stubGlobal("Neutralino", {
      filesystem: {
        readFile: vi.fn(async (path: string) =>
          JSON.stringify(
            roots.get(path.replace(/\/nvk-wine-runtime\.json$/, ""))
          )
        ),
      },
    });
    vi.mocked(exec).mockImplementation(async command => {
      const parts = command as string[];
      let stdOut = "";
      if (parts[0] === "/usr/bin/shasum") stdOut = "helper-hash  artifact\n";
      if (parts[1] === "check") {
        const fields = roots.get(parts[2]);
        if (!fields) throw new Error("Unexpected helper root in test");
        stdOut = JSON.stringify({
          result: "PASS",
          runtime_id: fields.runtime_id,
          wine_executable: fields.wine?.executable,
        });
      }
      return { stdOut, stdErr: "", exitCode: 0, pid: 1 };
    });
  });

  it("prefers the installed provider while retaining the packaged Wine loader", async () => {
    const runtime = await loadNVKRuntime();
    expect(runtime).toMatchObject({
      root: installed,
      wineRoot: BUNDLE,
      wine: BUNDLE + "/wine/bin/wine",
      helper: installed + "/bin/nvk-runtime",
      id: "driver-provider",
    });
  });

  it("uses the bundled renderer only when the installed provider is absent", async () => {
    roots.delete(installed);
    expect(await loadNVKRuntime()).toMatchObject({
      root: BUNDLE,
      wineRoot: BUNDLE,
      id: "bundled-runtime",
    });
  });

  it("does not hide an installed provider with an invalid helper hash", async () => {
    const invalid = manifest(installed, true);
    invalid.files["bin/nvk-runtime"] = "wrong-hash";
    roots.set(installed, invalid);
    await expect(loadNVKRuntime()).rejects.toThrow("checksum");
    expect(exec).not.toHaveBeenCalledWith([
      installed + "/bin/nvk-runtime",
      "check",
      installed,
    ]);
  });

  it("does not hide a partially installed provider with no manifest", async () => {
    vi.mocked(fileOrDirExists).mockImplementation(
      async path => path !== installed + "/nvk-wine-runtime.json"
    );
    await expect(loadNVKRuntime()).rejects.toThrow("runtime is missing");
  });

  it("requires the compatible bundled Wine rather than inventing a provider Wine path", async () => {
    roots.set(BUNDLE, manifest(BUNDLE, true));
    await expect(loadNVKRuntime()).rejects.toThrow("Wine executable");
  });

  it("keeps an existing Wine object's provider pinned during prefix preparation", async () => {
    const wine = {
      prefix: "/prefix-nvk",
      attributes: { nvkWineRoot: BUNDLE, nvkRuntimeRoot: BUNDLE },
    };
    expect(await prepareNVKPrefix(wine)).toMatchObject({ root: BUNDLE });
    expect(exec).toHaveBeenCalledWith([
      BUNDLE + "/bin/nvk-runtime",
      "install",
      BUNDLE,
      "/prefix-nvk",
    ]);
  });
});

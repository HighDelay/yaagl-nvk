import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@utils", () => ({
  exec: vi.fn(),
  fileOrDirExists: vi.fn(),
  mkdirp: vi.fn(),
  writeFile: vi.fn(),
  resolve: (path: string) => path,
}));
vi.mock("./nvk-wine", () => ({
  loadNVKWine: vi.fn(async () => ({
    wineRoot: "/launcher/wine-nvk",
    wine: "/launcher/wine-nvk/bin/wine",
  })),
}));
import { exec, fileOrDirExists } from "@utils";
import { loadNVKWine } from "./nvk-wine";
import {
  INSTALLED_NVK_ROOT,
  loadNVKProvider,
  loadNVKRuntime,
  prepareNVKPrefix,
} from "./nvk";
const installed = INSTALLED_NVK_ROOT;
let manifest: {
  schema_version: number;
  kind: string;
  runtime_id: string;
  files: Record<string, string>;
};
describe("driver-owned NVK/DXVK and downloaded Wine selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manifest = {
      schema_version: 1,
      kind: "provider",
      runtime_id: "driver-provider",
      files: { "bin/nvk-runtime": "helper-hash" },
    };
    vi.mocked(fileOrDirExists).mockResolvedValue(true);
    vi.stubGlobal("Neutralino", {
      filesystem: { readFile: vi.fn(async () => JSON.stringify(manifest)) },
    });
    vi.mocked(exec).mockImplementation(async command => {
      const parts = command as string[];
      const stdOut =
        parts[0] === "/usr/bin/shasum"
          ? "helper-hash  artifact"
          : parts[1] === "check"
          ? JSON.stringify({ result: "PASS", runtime_id: manifest.runtime_id })
          : "";
      return { stdOut, stdErr: "", exitCode: 0, pid: 1 };
    });
  });
  it("uses the installed provider and the separately prepared Wine loader", async () => {
    expect(await loadNVKRuntime()).toMatchObject({
      root: installed,
      wineRoot: "/launcher/wine-nvk",
      wine: "/launcher/wine-nvk/bin/wine",
      id: "driver-provider",
    });
  });
  it("requires the installed driver and never falls back to an app runtime", async () => {
    vi.mocked(fileOrDirExists).mockResolvedValue(false);
    await expect(loadNVKRuntime()).rejects.toThrow("Install this driver");
    expect(loadNVKWine).not.toHaveBeenCalled();
  });
  it("does not execute a provider helper with an invalid checksum", async () => {
    manifest.files["bin/nvk-runtime"] = "wrong-hash";
    await expect(loadNVKRuntime()).rejects.toThrow("checksum");
    expect(exec).not.toHaveBeenCalledWith([
      installed + "/bin/nvk-runtime",
      "check",
      installed,
    ]);
  });
  it("rejects an inappropriate provider manifest", async () => {
    manifest.kind = "full-bundle";
    await expect(loadNVKRuntime()).rejects.toThrow("compact driver provider");
  });
  it("validates the provider before downloading or initializing Wine", async () => {
    await loadNVKProvider();
    expect(loadNVKWine).not.toHaveBeenCalled();
  });
  it("installs the driver's matched pair using the driver's rollback helper", async () => {
    const wine = {
      prefix: "/prefix-nvk",
      attributes: { nvkRuntimeRoot: installed },
    };
    await prepareNVKPrefix(wine);
    expect(exec).toHaveBeenCalledWith([
      installed + "/bin/nvk-runtime",
      "install",
      installed,
      "/prefix-nvk",
    ]);
  });
});

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
  prepareNVKGame,
} from "./nvk";
const installed = INSTALLED_NVK_ROOT;
let manifest: {
  schema_version: number;
  kind: string;
  runtime_id: string;
  files: Record<string, string>;
  vkd3d?: { version: string; source_revision: string };
  dlss?: { nvapi_version: string; ngx_version: string };
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
    vi.mocked(fileOrDirExists).mockImplementation(
      async path => !String(path).endsWith(".nvk-dlss-state.json")
    );
    vi.stubGlobal("Neutralino", {
      filesystem: {
        readFile: vi.fn(async () => JSON.stringify(manifest)),
        readDirectory: vi.fn(async () => []),
      },
    });
    vi.mocked(exec).mockImplementation(async command => {
      const parts = command as string[];
      const stdOut =
        parts[0] === "/usr/bin/shasum"
          ? "helper-hash  artifact"
          : parts[1] === "check"
          ? JSON.stringify({
              result: "PASS",
              runtime_id: manifest.runtime_id,
              supports_d3d12: !!manifest.vkd3d,
              supports_dlss: !!manifest.dlss,
            })
          : "";
      return { stdOut, stdErr: "", exitCode: 0, pid: 1 };
    });
  });
  it("rejects DLSS without the driver component before modifying a prefix", async () => {
    manifest.vkd3d = { version: "3.1", source_revision: "upstream" };
    await expect(
      prepareNVKGame(
        { prefix: "/prefix", attributes: { renderBackend: "dxvk-nvk" } },
        "/game",
        { d3d12: true, dlss: true }
      )
    ).rejects.toThrow("containing NGX/NVAPI");
    expect(
      vi
        .mocked(exec)
        .mock.calls.some(c =>
          String((c[0] as string[])[1]).startsWith("install")
        )
    ).toBe(false);
  });
  it("installs DLSS with the matching Wine executable and restores it when disabled", async () => {
    manifest.vkd3d = { version: "3.1", source_revision: "upstream" };
    manifest.dlss = { nvapi_version: "0.9.2", ngx_version: "610.57.04" };
    const wine = {
      prefix: "/prefix",
      attributes: { renderBackend: "dxvk-nvk" as const },
    };
    await prepareNVKGame(wine, "/game", { d3d12: true, dlss: true });
    expect(exec).toHaveBeenCalledWith([
      installed + "/bin/nvk-runtime",
      "install-dlss",
      installed,
      "/prefix",
      "/launcher/wine-nvk/bin/wine",
    ]);
    vi.mocked(exec).mockClear();
    vi.mocked(fileOrDirExists).mockResolvedValue(true);
    await prepareNVKGame(wine, "/game", { d3d12: true, dlss: false });
    const mutations = vi
      .mocked(exec)
      .mock.calls.map(c => c[0] as string[])
      .filter(c => c[0].endsWith("nvk-runtime") && c[1] !== "check");
    expect(mutations).toEqual([
      [
        installed + "/bin/nvk-runtime",
        "restore-dlss",
        installed,
        "/prefix",
        "/launcher/wine-nvk/bin/wine",
      ],
      [installed + "/bin/nvk-runtime", "install-d3d12", installed, "/prefix"],
    ]);
  });
  it("refuses a different game-local NGX DLL but leaves the game's DLSS feature DLL alone", async () => {
    manifest.vkd3d = { version: "3.1", source_revision: "upstream" };
    manifest.dlss = { nvapi_version: "0.9.2", ngx_version: "610.57.04" };
    vi.mocked(Neutralino.filesystem.readDirectory).mockResolvedValue([
      { entry: "nvngx.dll", type: "FILE" },
    ]);
    await expect(
      prepareNVKGame(
        { prefix: "/prefix", attributes: { renderBackend: "dxvk-nvk" } },
        "/game",
        { d3d12: true, dlss: true }
      )
    ).rejects.toThrow("existing nvngx.dll");
    vi.mocked(Neutralino.filesystem.readDirectory).mockResolvedValue([
      { entry: "nvngx_dlss.dll", type: "FILE" },
      { entry: "nvngx_dlssg.dll", type: "FILE" },
    ]);
    await prepareNVKGame(
      { prefix: "/prefix", attributes: { renderBackend: "dxvk-nvk" } },
      "/game",
      { d3d12: true, dlss: true }
    );
    expect(exec).toHaveBeenCalledWith([
      installed + "/bin/nvk-runtime",
      "install-dlss",
      installed,
      "/prefix",
      "/launcher/wine-nvk/bin/wine",
    ]);
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
  it("rejects a D3D12 launch on an old provider before changing prefix DLLs", async () => {
    await expect(
      prepareNVKPrefix({ prefix: "/prefix", attributes: {} }, true)
    ).rejects.toThrow("containing vkd3d-proton");
    expect(
      vi
        .mocked(exec)
        .mock.calls.some(call => (call[0] as string[])[1] === "install-d3d12")
    ).toBe(false);
  });
  it("installs the D3D12 pair only when requested and available", async () => {
    manifest.vkd3d = { version: "3.1", source_revision: "upstream" };
    const runtime = await prepareNVKPrefix(
      { prefix: "/prefix", attributes: {} },
      true
    );
    expect(runtime.supportsD3d12).toBe(true);
    expect(exec).toHaveBeenCalledWith([
      installed + "/bin/nvk-runtime",
      "install-d3d12",
      installed,
      "/prefix",
    ]);
  });
  it("checks conflicting game-local D3D12 overrides before modifying prefix files", async () => {
    manifest.vkd3d = { version: "3.1", source_revision: "upstream" };
    vi.mocked(Neutralino.filesystem.readDirectory).mockResolvedValue([
      { entry: "d3d12.dll", type: "FILE" },
    ]);
    await expect(
      prepareNVKGame(
        { prefix: "/prefix", attributes: { renderBackend: "dxvk-nvk" } },
        "/game",
        { d3d12: true }
      )
    ).rejects.toThrow("existing d3d12.dll");
    expect(
      vi
        .mocked(exec)
        .mock.calls.some(call => (call[0] as string[])[1] === "install-d3d12")
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  graphicsArguments,
  nvkEnvironment,
  nvkOverrides,
  nvkPrefix,
  supportsNVKChannel,
} from "./nvk-contract";

describe("native NVK launch contract", () => {
  it("offers the shared backend for all three games in both regions", () => {
    for (const channel of [
      "napos",
      "napcn",
      "hk4eos",
      "hk4ecn",
      "hkrpgos",
      "hkrpgcn",
    ]) {
      expect(supportsNVKChannel(channel)).toBe(true);
    }
    expect(supportsNVKChannel("bh3glb")).toBe(false);
    expect(supportsNVKChannel("unknown")).toBe(false);
  });
  it("preserves unrelated overrides, including mixed clauses, while requiring the matched native pair", () => {
    expect(
      nvkOverrides("wininet=b;D3D11,version=n,b;dxgi.dll=b;mscoree,mshtml=")
    ).toBe("wininet=b;version=n,b;mscoree,mshtml=;d3d11,dxgi=n");
    expect(nvkOverrides("")).toBe("d3d11,dxgi=n");
  });
  it("keeps provider selection and a private prefix despite launch-time override clearing", () => {
    const env = nvkEnvironment(
      "/Volumes/Games/path with spaces/runtime",
      "/Volumes/Games/state",
      {
        WINEPREFIX: nvkPrefix("/Volumes/Games/wineprefix"),
        WINEDLLOVERRIDES: "",
        HTTP_PROXY: "http://127.0.0.1:8080",
        DXVK_LOG_PATH: "/Volumes/Games/per-run/logs",
      }
    );
    expect(env.DYLD_LIBRARY_PATH).toBe(
      "/Volumes/Games/path with spaces/runtime/lib"
    );
    expect(env.WINEPREFIX).toBe("/Volumes/Games/wineprefix-nvk");
    expect(env.WINEDLLOVERRIDES).toBe("d3d11,dxgi=n");
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:8080");
    expect(env.DXVK_LOG_PATH).toBe("/Volumes/Games/per-run/logs");
    expect(env.TMPDIR).toBe("/Volumes/Games/state/tmp");
    expect(env.DXVK_CONFIG).toBe("dxvk.enableDescriptorBuffer = False");
    expect(env.DXVK_HUD).toBe("devinfo,fps,frametimes,scale=1.25");
  });
  it("preserves explicit diagnostic overrides and allows the HUD to be disabled", () => {
    const env = nvkEnvironment("/runtime", "/state", {
      DXVK_CONFIG: "dxvk.enableDescriptorBuffer = True;dxgi.syncInterval = 0",
      DXVK_HUD: "",
    });
    expect(env.DXVK_CONFIG).toBe(
      "dxvk.enableDescriptorBuffer = False;dxvk.enableDescriptorBuffer = True;dxgi.syncInterval = 0"
    );
    expect(env.DXVK_HUD).toBe("");
  });
  it("forces the HUD off when the launcher toggle is disabled", () => {
    const env = nvkEnvironment(
      "/runtime",
      "/state",
      { DXVK_HUD: "devinfo,fps,scale=2" },
      false
    );
    expect(env.DXVK_HUD).toBe("0");
    expect(env.NVK_HUD).toBe("0");
    expect(env.WINE_NVK_HUD).toBe("0");
    expect(env.DXVK_CONFIG).toBe("dxvk.enableDescriptorBuffer = False");
    expect(env.DYLD_LIBRARY_PATH).toBe("/runtime/lib");
  });
  it("uses the explicit DLSS setting on D3D12 and leaves frame-generation discovery to the game", () => {
    const env = nvkEnvironment(
      "/runtime",
      "/state",
      {
        WINEDLLOVERRIDES: "wininet=b",
      },
      true,
      true,
      true
    );
    expect(env.DXVK_ENABLE_NVAPI).toBe("1");
    expect(env.WINE_NVK_EXPERIMENTAL).toBe("dlss");
    expect(env.WINE_NVK_HUD).toBe("fps,frametimes");
    expect(env.WINEDLLOVERRIDES).toBe(
      "wininet=b;d3d11,dxgi,d3d12,d3d12core,nvapi64,nvngx,_nvngx=n"
    );
    expect(env.WINEDLLOVERRIDES).not.toContain("dlssg");
    expect(env.WINEDLLOVERRIDES).not.toContain("sl.dlss_g");
    expect(nvkOverrides("nvngx_dlssg=n,b;wininet=b", true, true)).toBe(
      "nvngx_dlssg=n,b;wininet=b;d3d11,dxgi,d3d12,d3d12core,nvapi64,nvngx,_nvngx=n"
    );
    const d3d11 = nvkEnvironment("/runtime", "/state", {}, true, false, true);
    expect(d3d11.WINEDLLOVERRIDES).toBe("d3d11,dxgi=n");
    expect(d3d11.DXVK_ENABLE_NVAPI).toBe("0");
    expect(d3d11.WINE_NVK_EXPERIMENTAL).toBe("");
    expect(d3d11.WINE_NVK_HUD).toBe("0");
  });
  it("does not let an inherited experimental flag override the disabled DLSS setting", () => {
    const env = nvkEnvironment(
      "/runtime",
      "/state",
      {
        WINE_NVK_EXPERIMENTAL: "dlss",
        NVK_EXPERIMENTAL: "dlss",
        DXVK_ENABLE_NVAPI: "1",
      },
      true,
      true,
      false
    );
    expect(env.WINE_NVK_EXPERIMENTAL).toBe("");
    expect(env.NVK_EXPERIMENTAL).toBe("");
    expect(env.DXVK_ENABLE_NVAPI).toBe("0");
    expect(env.WINEDLLOVERRIDES).toBe("d3d11,dxgi,d3d12,d3d12core=n");
  });
  it("keeps NVK on D3D11 even with an old D3D12 preference", () => {
    expect(graphicsArguments("dxvk-nvk", true, true)).toEqual(["-force-d3d11"]);
    expect(graphicsArguments("dxvk-nvk", false, false)).toEqual([
      "-force-d3d11",
    ]);
    expect(graphicsArguments("d3dmetal", true, true)).toEqual(["-use-d3d12"]);
    expect(graphicsArguments("dxmt", undefined, true)).toEqual([]);
  });
  it("selects D3D12 only with the separate NVK preference and a capable provider", () => {
    expect(graphicsArguments("dxvk-nvk", true, false, true)).toEqual([
      "-use-d3d12",
    ]);
    expect(graphicsArguments("dxvk-nvk", true, true, false)).toEqual([
      "-force-d3d11",
    ]);
    expect(() => graphicsArguments("dxvk-nvk", false, false, true)).toThrow(
      "Update the driver"
    );
  });
  it("requires both native D3D12 DLLs and keeps unrelated mixed overrides", () => {
    expect(
      nvkOverrides("D3D12,version=b;d3d12core.dll=b;wininet=b", true)
    ).toBe("version=b;wininet=b;d3d11,dxgi,d3d12,d3d12core=n");
    const env = nvkEnvironment(
      "/runtime",
      "/state",
      {
        VKD3D_CONFIG: "single_queue",
        VKD3D_LOG_FILE: "/run/vkd3d.log",
      },
      false,
      true
    );
    expect(env.WINEDLLOVERRIDES).toBe("d3d11,dxgi,d3d12,d3d12core=n");
    expect(env.VKD3D_CONFIG).toBe("nodxr,single_queue");
    expect(env.VKD3D_LOG_FILE).toBe("/run/vkd3d.log");
    expect(env.DXVK_HUD).toBe("0");
  });
  it("selects the native presentation HUD for D3D12 without a duplicate DXVK overlay", () => {
    const env = nvkEnvironment("/runtime", "/state", {}, true, true);
    expect(env.NVK_HUD).toBe("fps,frametimes");
    expect(env.DXVK_HUD).toBe("0");
    expect(
      nvkEnvironment("/runtime", "/state", { NVK_HUD: "all" }, false, true)
        .NVK_HUD
    ).toBe("0");
    expect(nvkEnvironment("/runtime", "/state", {}, true, false).NVK_HUD).toBe(
      "0"
    );
  });
});

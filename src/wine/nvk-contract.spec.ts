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
  it("keeps NVK on D3D11 even with an old D3D12 preference", () => {
    expect(graphicsArguments("dxvk-nvk", true, true)).toEqual(["-force-d3d11"]);
    expect(graphicsArguments("dxvk-nvk", false, false)).toEqual([
      "-force-d3d11",
    ]);
    expect(graphicsArguments("d3dmetal", true, true)).toEqual(["-use-d3d12"]);
    expect(graphicsArguments("dxmt", undefined, true)).toEqual([]);
  });
});

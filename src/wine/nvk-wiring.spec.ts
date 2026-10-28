import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils", () => ({
  exec: vi.fn(async () => ({ exitCode: 0 })),
  exec2: vi.fn(async () => ({ exitCode: 0 })),
  getKey: vi.fn(async () => "DESKTOP-TESTING"),
  setKey: vi.fn(),
  stats: vi.fn(async () => ({})),
  resolve: (value: string) =>
    "/Volumes/Games/launcher/" + value.replace(/^\.\//, ""),
  generateRandomString: () => "TESTING",
  log: vi.fn(),
  writeFile: vi.fn(),
  env: vi.fn(async () => ""),
}));
vi.mock("./nvk", () => ({
  loadNVKRuntime: vi.fn(async () => ({
    root: "/Library/GPUBundles/nvmtl/wine",
    wineRoot: "/Volumes/Games/launcher/wine-nvk",
    wine: "/Volumes/Games/launcher/wine-nvk/bin/wine",
    id: "test-runtime",
  })),
  initializeNVKState: vi.fn(async () => "/Volumes/Games/launcher/nvk-state"),
  recordNVKLaunch: vi.fn(),
}));

import { createWine } from "./wine";
import { exec, exec2, env as hostEnvironment } from "@utils";
import { recordNVKLaunch } from "./nvk";

describe("actual Wine factory dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hostEnvironment).mockResolvedValue("");
  });

  it("uses the packaged loader/private prefix, then preserves native overrides at game launch", async () => {
    const wine = await createWine({
      prefix: "/Volumes/Games/launcher/wineprefix",
      distro: {
        id: "nvk",
        displayName: "NVK",
        remoteUrl: "local://nvk-runtime",
        attributes: { renderBackend: "dxvk-nvk" },
      },
    });
    await wine.exec("wineboot", ["-u"]);
    const bootstrap = vi.mocked(exec).mock.calls[0];
    expect(bootstrap[0]).toEqual([
      "/Volumes/Games/launcher/wine-nvk/bin/wine",
      "wineboot",
      "-u",
    ]);
    expect(bootstrap[1]).toMatchObject({
      WINEPREFIX: "/Volumes/Games/launcher/wineprefix-nvk",
      DYLD_LIBRARY_PATH: "/Library/GPUBundles/nvmtl/wine/lib",
      WINEDLLOVERRIDES: "",
    });
    await wine.exec2(
      "game.exe",
      [],
      {
        WINEDLLOVERRIDES: "wininet=b;d3d11=b",
        HTTP_PROXY: "http://localhost:8080",
      },
      "/Volumes/Games/game.log"
    );
    const game = vi.mocked(exec2).mock.calls[0];
    expect(game[1]).toMatchObject({
      WINEDLLOVERRIDES: "wininet=b;d3d11,dxgi=n",
      HTTP_PROXY: "http://localhost:8080",
      DXVK_LOG_PATH: "/Volumes/Games/game.log.nvk",
    });
    expect(recordNVKLaunch).toHaveBeenCalledOnce();
    await wine.killServer();
    expect(vi.mocked(exec2).mock.calls[1][0]).toEqual([
      "/Volumes/Games/launcher/wine-nvk/bin/wineserver",
      "-k",
    ]);
    expect(wine.prefix).toBe("/Volumes/Games/launcher/wineprefix-nvk");
    expect(wine.attributes).toMatchObject({
      nvkRuntimeRoot: "/Library/GPUBundles/nvmtl/wine",
      nvkWineRoot: "/Volumes/Games/launcher/wine-nvk",
    });
  });

  it("keeps the original loader, prefix and caller overrides for DXMT", async () => {
    const wine = await createWine({
      prefix: "/Volumes/Games/launcher/wineprefix",
      distro: {
        id: "dxmt",
        displayName: "DXMT",
        remoteUrl: "test",
        attributes: { renderBackend: "dxmt" },
      },
    });
    await wine.setProps({ retina: false, leftCmd: false, dxvkHud: false });
    vi.mocked(exec2).mockClear();
    await wine.exec2("game.exe", [], { WINEDLLOVERRIDES: "d3d11=b" });
    expect(vi.mocked(exec2).mock.calls[0][1]).toMatchObject({
      WINEPREFIX: "/Volumes/Games/launcher/wineprefix",
      WINEDLLOVERRIDES: "d3d11=b",
    });
    expect(vi.mocked(exec2).mock.calls[0][1]).not.toHaveProperty(
      "DYLD_LIBRARY_PATH"
    );
    expect(vi.mocked(exec2).mock.calls[0][1]).not.toHaveProperty("DXVK_HUD");
  });

  it("forwards explicit host HUD/config options only through the NVK factory", async () => {
    vi.mocked(hostEnvironment).mockImplementation(async name =>
      name === "DXVK_HUD" ? "fps,scale=2" : "dxgi.syncInterval = 0"
    );
    const wine = await createWine({
      prefix: "/Volumes/Games/launcher/wineprefix",
      distro: {
        id: "nvk",
        displayName: "NVK",
        remoteUrl: "local://nvk-runtime",
        attributes: { renderBackend: "dxvk-nvk" },
      },
    });
    await wine.exec2("game.exe", []);
    expect(vi.mocked(exec2).mock.calls[0][1]).toMatchObject({
      DXVK_CONFIG: "dxvk.enableDescriptorBuffer = False;dxgi.syncInterval = 0",
      DXVK_HUD: "fps,scale=2",
    });
  });

  it("applies the saved HUD toggle to NVK launches and restores custom styles when enabled", async () => {
    vi.mocked(hostEnvironment).mockImplementation(async name =>
      name === "DXVK_HUD" ? "fps,scale=2" : ""
    );
    const wine = await createWine({
      prefix: "/Volumes/Games/launcher/wineprefix",
      distro: {
        id: "nvk",
        displayName: "NVK",
        remoteUrl: "local://nvk-runtime",
        attributes: { renderBackend: "dxvk-nvk" },
      },
    });
    await wine.setProps({ retina: false, leftCmd: false, dxvkHud: false });
    vi.mocked(exec).mockClear();
    vi.mocked(exec2).mockClear();
    await wine.exec2("game.exe", [], { DXVK_HUD: "devinfo,fps" });
    expect(vi.mocked(exec2).mock.calls[0][1]).toMatchObject({ DXVK_HUD: "0" });
    await wine.exec("cmd", ["/c", "child.exe"]);
    expect(vi.mocked(exec).mock.calls[0][1]).toMatchObject({ DXVK_HUD: "0" });

    await wine.setProps({ retina: false, leftCmd: false, dxvkHud: true });
    vi.mocked(exec2).mockClear();
    await wine.exec2("game.exe", []);
    expect(vi.mocked(exec2).mock.calls[0][1]).toMatchObject({
      DXVK_HUD: "fps,scale=2",
    });
  });
});

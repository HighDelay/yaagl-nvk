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
    root: "/Volumes/Games/runtime",
    wine: "/Volumes/Games/runtime/wine/bin/wine",
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
      "/Volumes/Games/runtime/wine/bin/wine",
      "wineboot",
      "-u",
    ]);
    expect(bootstrap[1]).toMatchObject({
      WINEPREFIX: "/Volumes/Games/launcher/wineprefix-nvk",
      DYLD_LIBRARY_PATH: "/Volumes/Games/runtime/lib",
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
      "/Volumes/Games/runtime/wine/bin/wineserver",
      "-k",
    ]);
    expect(wine.prefix).toBe("/Volumes/Games/launcher/wineprefix-nvk");
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
    await wine.exec2("game.exe", [], { WINEDLLOVERRIDES: "d3d11=b" });
    expect(vi.mocked(exec2).mock.calls[0][1]).toMatchObject({
      WINEPREFIX: "/Volumes/Games/launcher/wineprefix",
      WINEDLLOVERRIDES: "d3d11=b",
    });
    expect(vi.mocked(exec2).mock.calls[0][1]).not.toHaveProperty(
      "DYLD_LIBRARY_PATH"
    );
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
});

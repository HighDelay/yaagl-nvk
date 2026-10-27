import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils", () => ({
  mkdirp: vi.fn(async () => undefined),
  removeFile: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  writeBinary: vi.fn(async () => undefined),
  readBinary: vi.fn(async () => new Uint8Array()),
  resolve: (path: string) => "/Volumes/Games/test/" + path.replace(/^\.\//, ""),
  log: vi.fn(async () => undefined),
  exec: vi.fn(async () => ({})),
  utf16le: (text: string) => new TextEncoder().encode(text),
  getKeyOrDefault: vi.fn(),
  resolvePreferredMaxFrameRate: vi.fn(async () => 0),
}));
vi.mock("../clients/mhy/patch", () => ({
  putLocal: vi.fn(),
  patchProgram: async function* () {
    return;
  },
  patchRevertProgram: async function* () {
    return;
  },
}));

import { writeFile } from "@utils";
import { launchGameProgram as launchZZZ } from "../clients/mhy/nap/program-launch-game";
import { launchGameProgram as launchGI } from "../clients/mhy/hk4e/program-launch-game";
import { launchGameProgram as launchHSR } from "../clients/mhy/hkrpg/program-launch-game";
import type { Wine } from "./wine";
import type { Config } from "@config";
import type { Server } from "@constants";

function wine(backend: "dxvk-nvk" | "dxmt") {
  return {
    attributes: { renderBackend: backend, supportsD3d12: true },
    toWinePath: (path: string) => "Z:" + path.replace(/\//g, "\\"),
    setProps: vi.fn(async () => undefined),
    setNVExtension: vi.fn(async () => undefined),
    waitUntilServerOff: vi.fn(async () => undefined),
    exec: vi.fn(async () => {
      throw new Error("No prior webview registry key");
    }),
    exec2: vi.fn(
      async (
        _program: string,
        _args: string[],
        _env?: Record<string, string>,
        _log?: string
      ) => undefined
    ),
  };
}

const games = [
  { name: "ZZZ", id: "nap_global", launch: launchZZZ },
  { name: "GI", id: "hk4e_global", launch: launchGI },
  { name: "HSR", id: "hkrpg_global", launch: launchHSR },
];

describe("actual game launch programs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const game of games) {
    for (const backend of ["dxvk-nvk", "dxmt"] as const) {
      it(`${game.name}: ${backend} retains its launch route and selects the expected API`, async () => {
        const instance = wine(backend);
        const config = { useD3D12: true } as Config;
        for await (const ignored of game.launch({
          gameDir: "/Volumes/Games/test/game",
          gameExecutable: "game.exe",
          wine: instance as unknown as Wine,
          config,
          server: { id: game.id } as Server,
        })) {
          void ignored;
        }
        const batch = vi
          .mocked(writeFile)
          .mock.calls.find(call => call[0].endsWith("config.bat"))?.[1];
        expect(batch).toBeTypeOf("string");
        expect(String(batch).includes("-force-d3d11")).toBe(
          backend === "dxvk-nvk"
        );
        expect(String(batch).includes("-use-d3d12")).toBe(
          game.name === "ZZZ" && backend === "dxmt"
        );
        if (game.name === "GI")
          expect(batch).toContain(
            "-platform_type CLOUD_THIRD_PARTY_PC -is_cloud 1"
          );
        if (game.name === "HSR") expect(batch).toContain("jadeite.exe");
        expect(instance.exec2.mock.calls[0][0]).toBe("cmd");
        expect(instance.setNVExtension).toHaveBeenCalledTimes(
          game.name === "HSR" && backend === "dxmt" ? 1 : 0
        );
      });
    }
    it(`${game.name}: Steam route forwards the D3D11 argument`, async () => {
      const instance = wine("dxvk-nvk");
      for await (const ignored of game.launch({
        gameDir: "/Volumes/Games/test/game",
        gameExecutable: "game.exe",
        wine: instance as unknown as Wine,
        config: {
          steamPatch: true,
          useD3D12: true,
          timeoutFix: true,
        } as Config,
        server: { id: game.id } as Server,
      })) {
        void ignored;
      }
      expect(instance.exec2.mock.calls[0][0]).toBe(
        "C:\\windows\\system32\\steam.exe"
      );
      expect(instance.exec2.mock.calls[0][1]).toContain("-force-d3d11");
      expect(instance.exec2.mock.calls[0][2]).toMatchObject({
        WINE_ENABLE_TIMEOUT_FIX: "1",
      });
      if (game.name === "HSR") {
        expect(instance.exec2.mock.calls[0][1][0]).toContain("jadeite.exe");
        expect(instance.exec2.mock.calls[0][1][1]).toContain("game.exe");
      }
    });
  }
});

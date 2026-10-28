import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils", () => ({
  getKeyOrDefault: vi.fn(async () => "NOTFOUND"),
  cp: vi.fn(async () => undefined),
  setKey: vi.fn(async () => undefined),
  resolve: (path: string) => "/Volumes/Games/test/" + path.replace(/^\.\//, ""),
}));
vi.mock("../downloadable-resource", () => ({
  DXMT_FILES: [],
  DXVK_FILES: [],
}));

import { cp } from "@utils";
import { patchProgram } from "../clients/mhy/patch";
import type { Config } from "@config";
import type { Server } from "@constants";
import type { Wine } from "./wine";

describe("Steam launch helper installation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const id of ["hkrpg_global", "hkrpg_cn"]) {
    for (const enabled of [true, false]) {
      it(`${id}: installs helpers when Steam launch is ${enabled}`, async () => {
        for await (const ignored of patchProgram(
          "/Volumes/Games/test/game",
          {
            prefix: "/Volumes/Games/test/wineprefix-nvk",
            attributes: { renderBackend: "dxvk-nvk" },
          } as Wine,
          { id } as Server,
          { patchOff: true, steamPatch: enabled } as Config
        )) {
          void ignored;
        }
        const copies = vi.mocked(cp).mock.calls;
        if (!enabled) {
          expect(copies).toEqual([]);
          return;
        }
        expect(copies).toEqual([
          [
            "/Volumes/Games/test/sidecar/protonextras/steam64.exe",
            "/Volumes/Games/test/wineprefix-nvk/drive_c/windows/system32/steam.exe",
          ],
          [
            "/Volumes/Games/test/sidecar/protonextras/steam32.exe",
            "/Volumes/Games/test/wineprefix-nvk/drive_c/windows/syswow64/steam.exe",
          ],
          [
            "/Volumes/Games/test/sidecar/protonextras/lsteamclient64.dll",
            "/Volumes/Games/test/wineprefix-nvk/drive_c/windows/system32/lsteamclient.dll",
          ],
          [
            "/Volumes/Games/test/sidecar/protonextras/lsteamclient32.dll",
            "/Volumes/Games/test/wineprefix-nvk/drive_c/windows/syswow64/lsteamclient.dll",
          ],
        ]);
      });
    }
  }
});

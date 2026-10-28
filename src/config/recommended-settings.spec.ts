import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils", () => ({
  getKeyOrDefault: vi.fn(),
  setKey: vi.fn(),
}));

import { getKeyOrDefault, setKey } from "../utils";
import { NVK_RUNTIME_ID } from "../wine/nvk-contract";
import {
  applyRecommendedSettings,
  RECOMMENDED_WINE_TAG,
  RECOMMENDED_WINE_URL,
} from "./recommended-settings";

const storage = new Map<string, string>();

describe("recommended Wine and launch settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.clear();
    vi.mocked(getKeyOrDefault).mockImplementation(
      async (key, fallback) => storage.get(key) ?? fallback
    );
    vi.mocked(setKey).mockImplementation(async (key, value) => {
      if (value == null) storage.delete(key);
      else storage.set(key, value);
    });
  });

  for (const channel of [
    "napos",
    "napcn",
    "hk4eos",
    "hk4ecn",
    "hkrpgos",
    "hkrpgcn",
  ]) {
    it(`${channel}: keeps a configured NVK profile and uses game-specific defaults`, async () => {
      storage.set("wine_state", "ready");
      storage.set("wine_tag", NVK_RUNTIME_ID);
      expect(await applyRecommendedSettings(channel)).toBe(NVK_RUNTIME_ID);
      expect(storage.get("wine_state")).toBe("ready");
      expect(storage.has("wine_update_tag")).toBe(false);
      expect(storage.has("wine_update_url")).toBe(false);
      expect(
        vi.mocked(setKey).mock.calls.some(([key]) => key.startsWith("wine_"))
      ).toBe(false);
      const expected = String(channel.startsWith("nap"));
      expect(storage.get("config_steam_patch")).toBe(expected);
      expect(storage.get("config_timeout_fix")).toBe(expected);
      expect(storage.get("config_block_net")).toBe("false");
    });
  }

  it("keeps NVK selected for recommended first setup", async () => {
    expect(await applyRecommendedSettings("hkrpgos", NVK_RUNTIME_ID)).toBe(
      NVK_RUNTIME_ID
    );
    expect(storage.get("wine_state")).toBe("update");
    expect(storage.get("wine_update_tag")).toBe(NVK_RUNTIME_ID);
    expect(storage.get("wine_update_url")).toBe("local://nvk-runtime");
  });

  it("repairs a pending ordinary-Wine recommendation for a selected NVK profile", async () => {
    storage.set("wine_state", "update");
    storage.set("wine_tag", NVK_RUNTIME_ID);
    storage.set("wine_update_tag", RECOMMENDED_WINE_TAG);
    storage.set("wine_update_url", RECOMMENDED_WINE_URL);
    await applyRecommendedSettings("hkrpgos");
    expect(storage.get("wine_update_tag")).toBe(NVK_RUNTIME_ID);
    expect(storage.get("wine_update_url")).toBe("local://nvk-runtime");
  });

  it("preserves the ordinary-Wine recommendation when NVK is not selected", async () => {
    storage.set("wine_tag", "9.9-dxmt");
    expect(await applyRecommendedSettings("hk4eos")).toBe(RECOMMENDED_WINE_TAG);
    expect(storage.get("wine_update_tag")).toBe(RECOMMENDED_WINE_TAG);
    expect(storage.get("wine_update_url")).toBe(RECOMMENDED_WINE_URL);
    expect(storage.get("config_steam_patch")).toBe("true");
  });
});

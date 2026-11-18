import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config-def";
import type { Locale } from "@locale";

vi.mock("@hope-ui/solid", () => ({}));
vi.mock("solid-js", () => ({
  createSignal: (value: boolean) => [() => value, vi.fn()],
  createEffect: vi.fn(),
}));
vi.mock("@utils", () => ({
  assertValueDefined: vi.fn(),
  getKey: vi.fn(),
  setKey: vi.fn(),
}));

import { getKey, setKey } from "@utils";
import createSharedLaunchFix from "../clients/mhy/hk4e/config/block-net";
import createHSRLaunchFix from "../clients/mhy/hkrpg/config/block-net";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HSR Launch Fix defaults and saved choices", () => {
  for (const channel of [
    "hkrpgos",
    "hkrpgcn",
    "hk4eos",
    "hk4ecn",
    "napos",
    "napcn",
  ]) {
    it(`${channel}: selects the correct first-setup default`, async () => {
      vi.stubEnv("YAAGL_CHANNEL_CLIENT", channel);
      vi.mocked(getKey).mockRejectedValueOnce(new Error("No saved setting"));
      const config: Partial<Config> = {};
      await createSharedLaunchFix({ config, locale: {} as Locale });
      expect(config.blockNet).toBe(channel.startsWith("hkrpg"));
    });
  }

  for (const create of [createSharedLaunchFix, createHSRLaunchFix]) {
    for (const saved of ["false", "true"]) {
      it(`preserves saved HSR choice ${saved}`, async () => {
        vi.stubEnv("YAAGL_CHANNEL_CLIENT", "hkrpgos");
        vi.mocked(getKey).mockResolvedValueOnce(saved);
        const config: Partial<Config> = {};
        await create({ config, locale: {} as Locale });
        expect(config.blockNet).toBe(saved === "true");
        expect(setKey).not.toHaveBeenCalled();
      });
    }
  }
});

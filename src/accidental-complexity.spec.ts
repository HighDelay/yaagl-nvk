import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@locale";

vi.mock("@utils", () => ({
  env: vi.fn(async () => "/Users/test"),
  log: vi.fn(async () => undefined),
}));

import { createGameInstallationDirectorySanitizer } from "./accidental-complexity";

async function select(...paths: string[]) {
  const openFolderDialog = vi.fn();
  for (const path of paths) openFolderDialog.mockResolvedValueOnce(path);
  const alert = vi.fn(async () => undefined);
  const sanitizer = await createGameInstallationDirectorySanitizer({
    openFolderDialog,
    locale: { alert } as unknown as Locale,
  });
  const path = await sanitizer.selectPath();
  return { path, alert };
}

describe("game installation directory selection", () => {
  it.each([
    "/Applications",
    "/Applications/Game",
    "/Users/test/Applications/Game",
    "/Users/test/Desktop/Game",
    "/Users/test/Downloads/Game",
    "/Users/test/Documents/Game",
    "/games/../Applications/Game",
    "/Users/test/Games/../Downloads/Game",
  ])("rejects forbidden directory %s and permits a retry", async path => {
    const result = await select(path, "/games/StarRail");
    expect(result.path).toBe("/games/StarRail");
    expect(result.alert).toHaveBeenCalledWith(
      "PATH_INVALID",
      "PATH_INVALID_FORBIDDEN_DIR"
    );
  });

  it.each([
    "/ApplicationsBackup/Game",
    "/Users/test/ApplicationsBackup/Game",
    "/Users/testing/Downloads/Game",
    "/games/Applications/Game",
    "/games/StarRail",
  ])("allows unrelated directory %s", async path => {
    const result = await select(path);
    expect(result.path).toBe(path);
    expect(result.alert).not.toHaveBeenCalled();
  });

  it("keeps cancellation and invalid-path handling", async () => {
    const result = await select("relative/game", "/games/ゲーム", "");
    expect(result.path).toBe("");
    expect(result.alert.mock.calls).toEqual([
      ["PATH_INVALID", "PLEASE_SELECT_A_DIR"],
      ["PATH_INVALID", "PATH_INVALID_ASCII_ONLY"],
    ]);
  });
});

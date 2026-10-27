import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve, appendFile, writeFile } from "./neu";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("launcher data paths", () => {
  it.each([
    [
      "/Volumes/Games/YAAGL/ZZZ/launcher-data",
      "/Volumes/Games/YAAGL/ZZZ/launcher-data",
    ],
    ["/Volumes/Games", "/Volumes/Games/YAAGL/ZZZ/launcher-data"],
    ["/Volumes/Games/YAAGL", "./ZZZ/launcher-data"],
    ["/Volumes/Games/folder with spaces", "./ZZZ/launcher-data"],
  ])("resolves resources once with cwd %s and --path %s", (cwd, appPath) => {
    vi.stubGlobal("window", { NL_CWD: cwd, NL_PATH: appPath });
    const root = appPath.startsWith("/") ? appPath : cwd + appPath.slice(1);
    expect(resolve("./aria2.session")).toBe(root + "/aria2.session");
    expect(resolve("wine-nvk/bin/wine")).toBe(root + "/wine-nvk/bin/wine");
    expect(resolve(resolve("./aria2.session"))).toBe(root + "/aria2.session");
    expect(resolve("/Library/GPUBundles/nvmtl/wine")).toBe(
      "/Library/GPUBundles/nvmtl/wine"
    );
  });

  it("passes the correct path to Neutralino file writes", async () => {
    const root = "/Volumes/Games/YAAGL-NVK/ZZZ/launcher-data";
    const append = vi.fn(async () => undefined);
    const write = vi.fn(async () => undefined);
    vi.stubGlobal("window", { NL_CWD: root, NL_PATH: root });
    vi.stubGlobal("Neutralino", {
      filesystem: { appendFile: append, writeFile: write },
    });
    await appendFile(resolve("./aria2.session"), "");
    await writeFile("wine-nvk/nvk-wine.json", "{}");
    expect(append).toHaveBeenCalledWith(root + "/aria2.session", "");
    expect(write).toHaveBeenCalledWith(root + "/wine-nvk/nvk-wine.json", "{}");
  });
});

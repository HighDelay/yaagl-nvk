import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

vi.mock("@utils", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const call = promisify(execFile);
  const run = async (parts: string[]) => {
    const result = await call(parts[0], parts.slice(1), {
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      stdOut: result.stdout,
      stdErr: result.stderr,
      exitCode: 0,
      pid: 1,
    };
  };
  return {
    exec: run,
    resolve: (name: string) =>
      path.resolve(
        process.env.YAAGL_TEST_WINE_WORK || "/invalid-test-root",
        name
      ),
    fileOrDirExists: async (name: string) =>
      fs.stat(name).then(
        () => true,
        () => false
      ),
    mkdirp: (name: string) => fs.mkdir(name, { recursive: true }),
    rmrf_dangerously: async (name: string) => {
      if (!name.startsWith("/Volumes/Games/"))
        throw new Error("Unexpected smoke-test cleanup path");
      await fs.rm(name, { recursive: true, force: true });
    },
    writeFile: (name: string, text: string) => fs.writeFile(name, text),
    readAllLines: async (name: string) =>
      (await fs.readFile(name, "utf8")).split(/\r?\n/),
    generateRandomString: () => Math.random().toString(16).slice(2),
    humanFileSize: (bytes: number) => String(bytes),
    tar_extract_directory: (archive: string, output: string, folder: string) =>
      run([
        "/usr/bin/tar",
        "--strip-components=1",
        "-C",
        output,
        "-Jxf",
        archive,
        folder,
      ]),
  };
});

import type { Aria2 } from "@aria2";
import { installNVKWine, loadNVKWine, NVK_WINE } from "./nvk-wine";
const suite = process.env.YAAGL_TEST_WINE_ARCHIVE ? describe : describe.skip;
suite("real private Wine setup from the pinned cached vendor archive", () => {
  it("refuses a bad download before extracting or publishing Wine", async () => {
    const originalRoot = process.env.YAAGL_TEST_WINE_WORK;
    if (!originalRoot || !originalRoot.startsWith("/Volumes/Games/"))
      throw new Error("Set isolated smoke-test paths");
    const root = originalRoot + "-bad archive";
    process.env.YAAGL_TEST_WINE_WORK = root;
    vi.stubGlobal("Neutralino", {
      filesystem: { readFile: (file: string) => fs.readFile(file, "utf8") },
    });
    const aria2 = {
      async *doStreamingDownload(request: { absDst: string }) {
        await fs.writeFile(request.absDst, "not the pinned Wine archive");
        yield {
          totalLength: BigInt(1),
          completedLength: BigInt(1),
          downloadSpeed: BigInt(0),
        };
      },
    } as unknown as Aria2;
    try {
      const run = async () => {
        for await (const _ of installNVKWine(aria2)) {
          /* progress */
        }
      };
      await expect(run()).rejects.toThrow("archive checksum mismatch");
      expect(
        await fs.stat(path.join(root, "wine-nvk")).catch(() => undefined)
      ).toBeUndefined();
      expect(
        await fs
          .stat(path.join(root, "wine-nvk.install-lock"))
          .catch(() => undefined)
      ).toBeUndefined();
    } finally {
      process.env.YAAGL_TEST_WINE_WORK = originalRoot;
    }
  });
  it("extracts, prepares, verifies and reuses Wine without shipping NVK/DXVK or touching ordinary Wine", async () => {
    const root = process.env.YAAGL_TEST_WINE_WORK;
    const archive = process.env.YAAGL_TEST_WINE_ARCHIVE;
    if (!root || !archive || !root.startsWith("/Volumes/Games/"))
      throw new Error("Set isolated smoke-test paths");
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.join(root, "wine"), { recursive: true });
    await fs.writeFile(
      path.join(root, "wine/keep.txt"),
      "ordinary Wine retained"
    );
    vi.stubGlobal("Neutralino", {
      filesystem: { readFile: (file: string) => fs.readFile(file, "utf8") },
    });
    let downloads = 0;
    const aria2 = {
      async *doStreamingDownload(request: {
        uri: string;
        absDst: string;
        checksum: string;
      }) {
        expect(request.uri).toBe(NVK_WINE.url);
        expect(request.checksum).toBe("sha-256=" + NVK_WINE.sha256);
        await fs.copyFile(archive, request.absDst);
        downloads++;
        const size = BigInt((await fs.stat(archive)).size);
        yield {
          totalLength: size,
          completedLength: size,
          downloadSpeed: BigInt(0),
        };
      },
    } as unknown as Aria2;
    for await (const _ of installNVKWine(aria2)) {
      /* UI progress consumed */
    }
    const loaded = await loadNVKWine();
    expect(loaded.wine).toBe(path.join(root, "wine-nvk/bin/wine"));
    for await (const _ of installNVKWine(aria2)) {
      /* Cached path must not download again */
    }
    expect(downloads).toBe(1);
    expect(await fs.readFile(path.join(root, "wine/keep.txt"), "utf8")).toBe(
      "ordinary Wine retained"
    );
    expect(
      await fs.stat(path.join(root, "runtime")).catch(() => undefined)
    ).toBeUndefined();
    const inf = path.join(root, "wine-nvk/share/wine/wine.inf"),
      original = await fs.readFile(inf);
    await fs.appendFile(inf, "tampered");
    await expect(loadNVKWine()).rejects.toThrow("checksum");
    await fs.writeFile(inf, original);
    const marker = JSON.parse(
      await fs.readFile(path.join(root, "wine-nvk/nvk-wine.json"), "utf8")
    );
    await fs.writeFile(
      path.join(root, "SETUP-RESULT.json"),
      JSON.stringify(
        {
          result: "PASS",
          downloads,
          files: Object.keys(marker.files).length,
          wine: loaded.wine,
          archive_sha256: marker.archive_sha256,
        },
        null,
        2
      )
    );
  }, 180000);
});

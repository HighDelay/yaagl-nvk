import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("libaria2-ts", () => ({
  WebSocket: { Client: vi.fn() },
}));
vi.mock("./utils", () => ({
  log: vi.fn(async () => undefined),
  wait: vi.fn(async () => undefined),
  timeout: vi.fn(() => new Promise<never>(() => undefined)),
  sha256_16: vi.fn(async () => "aabbccddeeff0011"),
  fileOrDirExists: vi.fn(async () => true),
}));

import { WebSocket as RPC } from "libaria2-ts";
import { fileOrDirExists, sha256_16, wait } from "./utils";
import { createAria2 } from "./aria2";

const gid = "aabbccddeeff0011";
const request = {
  uri: "https://codeberg.org/mkrsym1/jadeite/releases/download/v4.1.0/v4.1.0.zip",
  absDst: "/launcher-data/jadeite/archive.zip",
  checksum: "sha-256=expected-hash",
};
const rpc = {
  getVersion: vi.fn(async () => ({ version: "1.37.0" })),
  tellStatus: vi.fn(),
  addUri: vi.fn(async () => gid),
  unpause: vi.fn(async () => gid),
  removeDownloadResult: vi.fn(async () => "OK"),
  shutdown: vi.fn(),
};
function status(state: string, length = 100n) {
  return {
    gid,
    status: state,
    totalLength: length,
    completedLength: state === "complete" ? length : 10n,
    downloadSpeed: 10n,
  };
}
async function download() {
  const service = await createAria2({ host: "127.0.0.1", port: 6868 });
  const progress = [];
  for await (const step of service.doStreamingDownload(request))
    progress.push(step);
  return progress;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.tellStatus.mockReset();
  rpc.removeDownloadResult.mockResolvedValue("OK");
  rpc.addUri.mockResolvedValue(gid);
  vi.mocked(fileOrDirExists).mockResolvedValue(true);
  vi.mocked(RPC.Client).mockImplementation(() => rpc as unknown as RPC.Client);
});

describe("aria2 download recovery", () => {
  it("adds a missing task with its original URL, destination and checksum", async () => {
    rpc.tellStatus
      .mockRejectedValueOnce({ code: 1, message: "GID not found" })
      .mockResolvedValueOnce(status("active"))
      .mockResolvedValueOnce(status("complete"));
    expect(await download()).toHaveLength(1);
    expect(sha256_16).toHaveBeenCalledWith(`${request.uri}:${request.absDst}`);
    expect(rpc.addUri).toHaveBeenCalledWith(request.uri, {
      gid,
      "max-connection-per-server": 16,
      out: request.absDst,
      continue: false,
      "allow-overwrite": true,
      checksum: request.checksum,
    });
    expect(rpc.removeDownloadResult).not.toHaveBeenCalled();
  });

  for (const state of ["error", "removed"]) {
    it(`retries a stopped ${state} task after clearing only its result`, async () => {
      rpc.tellStatus
        .mockResolvedValueOnce(status(state))
        .mockResolvedValueOnce(status("complete"));
      await download();
      expect(rpc.removeDownloadResult).toHaveBeenCalledOnce();
      expect(rpc.removeDownloadResult).toHaveBeenCalledWith(gid);
      expect(rpc.addUri).toHaveBeenCalledOnce();
      expect(rpc.removeDownloadResult.mock.invocationCallOrder[0]).toBeLessThan(
        rpc.addUri.mock.invocationCallOrder[0]
      );
    });
  }

  for (const state of ["active", "waiting"]) {
    it(`continues an existing ${state} task without adding a duplicate`, async () => {
      rpc.tellStatus
        .mockResolvedValueOnce(status(state))
        .mockResolvedValueOnce(status("active"))
        .mockResolvedValueOnce(status("complete"));
      expect(await download()).toHaveLength(1);
      expect(rpc.addUri).not.toHaveBeenCalled();
      expect(rpc.removeDownloadResult).not.toHaveBeenCalled();
      expect(rpc.unpause).not.toHaveBeenCalled();
    });
  }

  it("resumes a paused task", async () => {
    rpc.tellStatus
      .mockResolvedValueOnce(status("paused"))
      .mockResolvedValueOnce(status("complete"));
    await download();
    expect(rpc.unpause).toHaveBeenCalledWith(gid);
    expect(rpc.addUri).not.toHaveBeenCalled();
  });

  it("reuses a completed task only if its downloaded file still exists", async () => {
    rpc.tellStatus.mockResolvedValueOnce(status("complete"));
    expect(await download()).toEqual([]);
    expect(fileOrDirExists).toHaveBeenCalledWith(request.absDst);
    expect(rpc.addUri).not.toHaveBeenCalled();
    expect(rpc.removeDownloadResult).not.toHaveBeenCalled();
  });

  it("redownloads when a completed task's output has been removed", async () => {
    vi.mocked(fileOrDirExists).mockResolvedValueOnce(false);
    rpc.tellStatus
      .mockResolvedValueOnce(status("complete"))
      .mockResolvedValueOnce(status("complete"));
    await download();
    expect(rpc.removeDownloadResult).toHaveBeenCalledWith(gid);
    expect(rpc.addUri).toHaveBeenCalledOnce();
  });

  it("reports the real DNS failure and permits retry in the same launcher session", async () => {
    const failure = {
      ...status("error"),
      errorCode: "19",
      errorMessage:
        "Name resolution for codeberg.org failed: Domain name not found",
    };
    rpc.tellStatus
      .mockRejectedValueOnce({ code: 1 })
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(status("complete"));
    await expect(download()).rejects.toThrow(
      "Download failed from codeberg.org: Name resolution for codeberg.org failed"
    );
    expect(rpc.addUri).toHaveBeenCalledOnce();
    await download();
    expect(rpc.addUri).toHaveBeenCalledTimes(2);
    expect(rpc.removeDownloadResult).toHaveBeenCalledOnce();
  });

  it("reports cancellation during streaming", async () => {
    rpc.tellStatus
      .mockResolvedValueOnce(status("active"))
      .mockResolvedValueOnce({ ...status("removed"), errorCode: "0" });
    await expect(download()).rejects.toThrow("Download was cancelled");
  });

  it("waits between polls while the server has not returned a content length", async () => {
    rpc.tellStatus
      .mockResolvedValueOnce(status("waiting"))
      .mockResolvedValueOnce(status("active", 0n))
      .mockResolvedValueOnce(status("active", 0n))
      .mockResolvedValueOnce(status("complete"));
    expect(await download()).toEqual([]);
    expect(
      vi.mocked(wait).mock.calls.filter(([ms]) => ms === 100)
    ).toHaveLength(2);
  });

  it("propagates RPC errors without discarding or resubmitting downloads", async () => {
    rpc.tellStatus.mockRejectedValueOnce({
      code: 2,
      message: "RPC unavailable",
    });
    await expect(download()).rejects.toEqual({
      code: 2,
      message: "RPC unavailable",
    });
    expect(rpc.addUri).not.toHaveBeenCalled();
    expect(rpc.removeDownloadResult).not.toHaveBeenCalled();
  });

  it("does not resubmit a task when clearing its result fails", async () => {
    rpc.tellStatus.mockResolvedValueOnce(status("error"));
    rpc.removeDownloadResult.mockRejectedValueOnce({ code: 1 });
    await expect(download()).rejects.toEqual({ code: 1 });
    expect(rpc.addUri).not.toHaveBeenCalled();
  });

  it("does not treat an add failure as a missing-task lookup", async () => {
    rpc.tellStatus.mockRejectedValueOnce({ code: 1 });
    rpc.addUri.mockRejectedValueOnce({ code: 1, message: "Invalid download" });
    await expect(download()).rejects.toEqual({
      code: 1,
      message: "Invalid download",
    });
    expect(rpc.addUri).toHaveBeenCalledOnce();
  });
});

import { WebSocket as RPC } from "libaria2-ts";
import { fileOrDirExists, log, sha256_16, wait, timeout } from "./utils";

export async function createAria2({
  host,
  port,
}: {
  host: string;
  port: number;
}) {
  await wait(500); // FIXME:
  const rpc = new RPC.Client({
    host,
    port,
  });
  const version = await Promise.race([rpc.getVersion(), timeout(3000)]);

  function shutdown() {
    return rpc.shutdown();
  }

  async function* doStreaming(gid: string, uri: string) {
    while (true) {
      const status = await rpc.tellStatus(gid);
      if (status.status == "complete") {
        break;
      }
      if (status.status == "error" || status.status == "removed") {
        const errorDetail =
          status.status === "removed"
            ? "Download was cancelled"
            : status.errorMessage ||
              (status.errorCode
                ? `Error Code ${status.errorCode}`
                : "Unknown aria2 error");
        throw new Error(
          `Download failed from ${
            new URL(uri).hostname
          }: ${errorDetail}\n\nPlease try again once the download server is reachable.`
        );
      }
      if (status.totalLength == BigInt(0)) {
        await wait(100);
        continue;
      }
      yield status;
      await wait(100);
    }
  }

  async function* doStreamingDownload(options: {
    uri: string;
    absDst: string;
    checksum?: string;
  }) {
    const gid = await sha256_16(`${options.uri}:${options.absDst}`);
    let status;
    try {
      status = await rpc.tellStatus(gid);
    } catch (e: unknown) {
      if (!(typeof e == "object" && e != null && "code" in e && e["code"] == 1))
        throw e;
    }

    if (
      status?.status === "complete" &&
      (await fileOrDirExists(options.absDst))
    )
      return;
    if (status && ["error", "removed", "complete"].includes(status.status)) {
      // A failed task remains in aria2's result history. Clear only this task
      // before retrying, including a completed task whose output was removed.
      await rpc.removeDownloadResult(gid);
      status = undefined;
    }
    if (!status) {
      await rpc.addUri(options.uri, {
        gid,
        "max-connection-per-server": 16,
        out: options.absDst,
        continue: false,
        "allow-overwrite": true, // in case control file broken
        ...(options.checksum ? { checksum: options.checksum } : {}),
      });
    } else if (status.status === "paused") {
      await rpc.unpause(gid);
    } else if (status.status !== "active" && status.status !== "waiting") {
      throw new Error(`Cannot resume download in state: ${status.status}`);
    }
    return yield* doStreaming(gid, options.uri);
  }

  return {
    version,
    shutdown,
    doStreamingDownload,
  };
}

export type Aria2 = ReturnType<typeof createAria2> extends Promise<infer T>
  ? T
  : never;

export async function createAria2Retry({
  host,
  port,
}: {
  host: string;
  port: number;
}): Promise<Aria2> {
  for (let i = 0; i < 30; i++) {
    try {
      return await createAria2({ host, port });
    } catch (e) {
      await log("Fail to create aria2 rpc, retrying... " + e);
    }
  }
  throw new Error("Fail to create aria2 rpc");
}

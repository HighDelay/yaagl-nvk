import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addTerminationHook, exit, _safeRelaunch } from "./neu";

let releaseHook: () => void;
const cleanup = vi.fn(async () => true);
const killProcess = vi.fn(async () => undefined);
const appExit = vi.fn(async (_code?: number) => undefined);
const execCommand = vi.fn(async (_command: string, _options?: unknown) => ({
  pid: 900,
}));
const app = "/packages/O'Brien/ZZZ/YAAGL NVK - ZZZ.app";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("PROD", "1");
  vi.stubGlobal("window", {
    NL_OS: "Darwin",
    NL_APPID: "com.highdelay.yaagl.nvk.napos",
    NL_PID: "100",
    NL_CWD: "/elsewhere",
    NL_PATH: "/packages/O'Brien/ZZZ/launcher-data",
    NL_ARGS: ["/temporary/Yaagl", "--path=/packages/ZZZ/launcher-data"],
  });
  vi.stubGlobal("Neutralino", {
    app: { killProcess, exit: appExit },
    os: { execCommand, getEnv: vi.fn(async () => app) },
  });
  releaseHook = addTerminationHook(cleanup);
});

afterEach(() => {
  releaseHook();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("launcher exit and restart", () => {
  it("finishes macOS cleanup before killing the launcher", async () => {
    const done = exit(-1);
    expect(killProcess).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(killProcess).toHaveBeenCalledOnce();
    expect(appExit).not.toHaveBeenCalled();
  });

  it("preserves exit codes on other platforms", async () => {
    window.NL_OS = "Linux";
    await exit(7);
    expect(appExit).toHaveBeenCalledWith(7);
    expect(killProcess).not.toHaveBeenCalled();
  });

  it("forwards the original NVK package folder through LaunchServices", async () => {
    const done = _safeRelaunch();
    await vi.runAllTimersAsync();
    await done;
    expect(cleanup).toHaveBeenCalledOnce();
    const command = execCommand.mock.calls[0][0];
    expect(command).toContain(
      "'--args' '--yaagl-root' '/packages/O'\\''Brien/ZZZ'"
    );
    expect(command).toContain("'/usr/bin/open' '-n'");
    expect(command).toContain("while kill -0");
    expect(command).toContain("'100'");
    execFileSync("/bin/sh", ["-n", "-c", command]);
    expect(killProcess).toHaveBeenCalledOnce();
  });

  it("keeps the upstream app's normal production restart arguments", async () => {
    window.NL_APPID = "com.3shain.yaagl";
    const done = _safeRelaunch();
    await vi.runAllTimersAsync();
    await done;
    expect(execCommand.mock.calls[0][0]).not.toContain("--yaagl-root");
  });

  it("keeps development process arguments intact", async () => {
    vi.stubEnv("PROD", "");
    const done = _safeRelaunch();
    await vi.runAllTimersAsync();
    await done;
    const command = execCommand.mock.calls[0][0];
    expect(command).toContain(
      "'/temporary/Yaagl' '--path=/packages/ZZZ/launcher-data'"
    );
    expect(command).not.toContain("/usr/bin/open");
  });

  it("does not start two handoffs for simultaneous restart requests", async () => {
    const done = Promise.all([_safeRelaunch(), _safeRelaunch()]);
    await vi.runAllTimersAsync();
    await done;
    expect(execCommand).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("rejects a missing launch location before shutting down", async () => {
    vi.mocked(Neutralino.os.getEnv).mockResolvedValueOnce("");
    await expect(_safeRelaunch()).rejects.toThrow("Launcher path is missing");
    expect(execCommand).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("cancels the waiting handoff if exiting the old launcher fails", async () => {
    killProcess.mockRejectedValueOnce(new Error("exit failed"));
    const check = expect(_safeRelaunch()).rejects.toThrow("exit failed");
    await vi.runAllTimersAsync();
    await check;
    expect(execCommand).toHaveBeenCalledTimes(2);
    expect(execCommand.mock.calls[1][0]).toContain("kill 900");
  });
});

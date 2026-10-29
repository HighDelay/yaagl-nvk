import {
  exec as unixExec,
  exec2 as unixExec2,
  getKey,
  log,
  setKey,
  arrayFind,
  getCPUInfo,
  build,
  generateRandomString,
  stats,
  resolve,
  writeFile,
  env as hostEnvironment,
} from "@utils";
import { dirname, join } from "path-browserify";
import { WineDistribution } from "./distro";
import { initializeNVKState, loadNVKRuntime, recordNVKLaunch } from "./nvk";
import { nvkEnvironment, nvkPrefix } from "./nvk-contract";

export async function createWine(options: {
  prefix: string;
  distro: WineDistribution;
}) {
  const nvk =
    options.distro.attributes.renderBackend === "dxvk-nvk"
      ? await loadNVKRuntime(
          options.distro.attributes.nvkRuntimeRoot ||
            (await hostEnvironment("YAAGL_NVK_RUNTIME_ROOT").catch(
              () => undefined
            )) ||
            undefined
        )
      : undefined;
  const loaderBin = nvk ? nvk.wine : await getCorrectWineBinary();
  const selectedPrefix = nvk ? nvkPrefix(options.prefix) : options.prefix;
  const nvkState = nvk ? await initializeNVKState() : "";
  let dxvkHudEnabled = true;
  let nativeD3d12 = false;
  let nativeDLSS = false;
  const nvkHostOptions: Record<string, string> = {};
  if (nvk) {
    for (const name of [
      "DXVK_CONFIG",
      "DXVK_HUD",
      "NVK_HUD",
      "VKD3D_CONFIG",
      "VKD3D_DEBUG",
    ]) {
      const value = await hostEnvironment(name).catch(() => undefined);
      if (value) nvkHostOptions[name] = value;
    }
  }

  async function cmd(command: string, args: string[]) {
    return await exec("cmd", [command, ...args]);
  }

  async function exec(
    program: string,
    args: string[],
    env?: { [key: string]: string },
    log_file: string | undefined = undefined
  ) {
    return await unixExec(
      program == "copy"
        ? [loaderBin, "cmd", "/c", program, ...args]
        : [loaderBin, program, ...args],
      getEnvironmentVariables(
        env,
        program === "wineboot" || program === "winecfg"
      ),
      false,
      log_file
    );
  }

  async function exec2(
    program: string,
    args: string[],
    env?: { [key: string]: string },
    log_file: string | undefined = undefined
  ) {
    if (nvk && log_file) {
      const directory = log_file + ".nvk";
      await recordNVKLaunch(nvk, directory, nativeD3d12, nativeDLSS);
      env = {
        ...env,
        DXVK_LOG_PATH: directory,
        VKD3D_LOG_FILE: toWinePath(join(directory, "vkd3d.log")),
      };
    }
    return await unixExec2(
      program == "copy"
        ? [loaderBin, "cmd", "/c", program, ...args]
        : [loaderBin, program, ...args],
      getEnvironmentVariables(env),
      false,
      log_file
    );
  }

  async function waitUntilServerOff() {
    return await unixExec2([join(dirname(loaderBin), "wineserver"), "-w"], {
      ...getEnvironmentVariables(),
    });
  }

  async function killServer() {
    return await unixExec2([join(dirname(loaderBin), "wineserver"), "-k"], {
      ...getEnvironmentVariables(),
    });
  }

  function toWinePath(absPath: string) {
    return "Z:" + `${absPath}`.replaceAll("/", "\\");
  }

  function getEnvironmentVariables(
    extra: Record<string, string> = {},
    bootstrap = false
  ) {
    const base = {
      ...nvkHostOptions,
      WINEDEBUG: "fixme-all,err-unwind,+timestamp",
      WINEPREFIX: selectedPrefix,
      ...extra,
    };
    if (!nvk) return base;
    const selected = nvkEnvironment(
      nvk.root,
      nvkState,
      base,
      dxvkHudEnabled,
      nativeD3d12,
      nativeDLSS
    );
    // Prefix initialization creates system32 before the native pair can be
    // installed. Configuration helpers must not require that pair prematurely.
    if (bootstrap) selected.WINEDLLOVERRIDES = extra.WINEDLLOVERRIDES || "";
    return selected;
  }

  async function openCmdWindow({ gameDir }: { gameDir: string }) {
    return await unixExec2(
      [
        `osascript`,
        "-e",
        [
          "tell",
          "app",
          '"Terminal"',
          "to",
          "do",
          "script",
          `"${build([loaderBin, "cmd"], {
            ...getEnvironmentVariables(),
            WINEPATH: toWinePath(gameDir),
          })
            .replaceAll("\\", "\\\\")
            .replaceAll('"', '\\"')}"`,
        ].join(" "),
        "-e",
        ["tell", "app", '"Terminal"', "to", "activate"].join(" "),
      ],
      {},
      false,
      "/dev/null"
    );
  }

  let netbiosname: string;
  try {
    netbiosname = await getKey("wine_netbiosname");
  } catch {
    netbiosname = `DESKTOP-${generateRandomString(7)}`; // exactly 15 chars
    await setKey("wine_netbiosname", netbiosname);
  }

  async function setProps(props: {
    retina: boolean;
    leftCmd: boolean;
    dxvkHud?: boolean;
    useNVKD3D12?: boolean;
    useNVKDLSS?: boolean;
  }) {
    dxvkHudEnabled = props.dxvkHud !== false;
    if (nvk && props.useNVKD3D12 && !nvk.supportsD3d12)
      throw new Error(
        "Update the driver Wine/NVK runtime for vkd3d-proton D3D12."
      );
    nativeD3d12 = !!nvk && props.useNVKD3D12 === true;
    nativeDLSS = nativeD3d12 && props.useNVKDLSS === true;
    if (nativeDLSS && !nvk?.supportsDLSS)
      throw new Error(
        "Update the driver Wine/NVK runtime to a build containing NGX/NVAPI for DLSS."
      );
    const cmd = `@echo off
cd "%~dp0"
reg add "HKEY_CURRENT_USER\\Software\\Wine\\Mac Driver" /v RetinaMode /t REG_SZ /d ${
      props.retina ? "y" : "n"
    } /f
reg add "HKEY_CURRENT_USER\\Software\\Wine\\Mac Driver" /v LeftCommandIsCtrl /t REG_SZ /d ${
      props.leftCmd ? "y" : "n"
    } /f
`;
    await writeFile(resolve("winedrv_config.bat"), cmd);
    await exec(
      "cmd",
      ["/c", `${toWinePath(resolve("./winedrv_config.bat"))}`],
      {},
      "/dev/null"
    );
    await waitUntilServerOff();
  }

  async function setNVExtension() {
    const cmd = `@echo off
cd "%~dp0"
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\NVIDIA Corporation\\Global" /v "{41FCC608-8496-4DEF-B43E-7D9BD675A6FF}" /t REG_BINARY /d 1 /f
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\ControlSet001\\Services\\nvlddmkm" /v "{41FCC608-8496-4DEF-B43E-7D9BD675A6FF}" /t REG_BINARY /d 1 /f
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\NVIDIA Corporation\\Global\\NGXCore" /v FullPath /t REG_SZ /d "C:\\Windows\\System32" /f
`;
    await writeFile(resolve("winedrv_config.bat"), cmd);
    await exec(
      "cmd",
      ["/c", `${toWinePath(resolve("./winedrv_config.bat"))}`],
      {},
      "/dev/null"
    );
    await waitUntilServerOff();
  }

  return {
    exec,
    exec2,
    waitUntilServerOff,
    killServer,
    cmd,
    toWinePath,
    prefix: selectedPrefix,
    openCmdWindow,
    setProps,
    setNVExtension,
    attributes: {
      ...options.distro.attributes,
      ...(nvk
        ? {
            nvkRuntimeRoot: nvk.root,
            nvkWineRoot: nvk.wineRoot,
            supportsD3d12: nvk.supportsD3d12 === true,
          }
        : {}),
    },
  };
}

export async function getCorrectWineBinary() {
  try {
    // use wine64 if it is presented
    // in newer version of wine (esp. WoW64 mode), only one binary `bin/wine` exists
    await stats("./wine/bin/wine64");
    return resolve("./wine/bin/wine64");
  } catch {
    return resolve("./wine/bin/wine");
  }
}

export type Wine = ReturnType<typeof createWine> extends Promise<infer T>
  ? T
  : never;

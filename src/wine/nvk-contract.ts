import { join } from "path-browserify";

// DXVK is selected by the installed driver manifest, not this Wine distro ID.
export const NVK_RUNTIME_ID = "driver-nvk-wine-11.0-1";

export function supportsNVKChannel(channel: string): boolean {
  return ["napos", "napcn", "hk4eos", "hk4ecn", "hkrpgos", "hkrpgcn"].includes(
    channel
  );
}

export function nvkPrefix(prefix: string): string {
  return prefix + "-nvk";
}

export function nvkOverrides(
  previous = "",
  d3d12 = false,
  dlss = false
): string {
  const managed = d3d12
    ? ["d3d11", "dxgi", "d3d12", "d3d12core"]
    : ["d3d11", "dxgi"];
  if (d3d12 && dlss) managed.push("nvapi64", "nvngx", "_nvngx");
  const preserved = previous
    .split(";")
    .map(clause => {
      const equals = clause.indexOf("=");
      if (equals < 0) return clause.trim();
      const names = clause
        .slice(0, equals)
        .split(",")
        .map(name => name.trim())
        .filter(
          name => !managed.includes(name.toLowerCase().replace(/\.dll$/, ""))
        );
      return names.length ? names.join(",") + clause.slice(equals) : "";
    })
    .filter(Boolean);
  return [...preserved, managed.join(",") + "=n"].join(";");
}

export function nvkEnvironment(
  root: string,
  state: string,
  caller: Record<string, string>,
  hudEnabled = true,
  d3d12 = false,
  requestedDLSS = false
): Record<string, string> {
  const dlss = d3d12 && requestedDLSS;
  return {
    ...caller,
    DYLD_LIBRARY_PATH: join(root, "lib"),
    DYLD_PRINT_LIBRARIES: "1",
    WINEDEBUG: [
      caller.WINEDEBUG || "fixme-all,err-unwind,+timestamp",
      "+pid,+loaddll",
    ].join(","),
    WINEDLLOVERRIDES: nvkOverrides(caller.WINEDLLOVERRIDES, d3d12, dlss),
    DXVK_ENABLE_NVAPI: dlss ? "1" : "0",
    NVK_EXPERIMENTAL: dlss ? "dlss" : "",
    WINE_NVK_EXPERIMENTAL: dlss ? "dlss" : "",
    TMPDIR: join(state, "tmp"),
    MESA_SHADER_CACHE_DIR: join(state, "shader-cache"),
    XDG_CACHE_HOME: join(state, "cache"),
    XDG_CONFIG_HOME: join(state, "config"),
    XDG_DATA_HOME: join(state, "data"),
    DXVK_LOG_PATH: caller.DXVK_LOG_PATH || join(state, "logs"),
    DXVK_LOG_LEVEL: "info",
    VKD3D_CONFIG: ["nodxr", caller.VKD3D_CONFIG].filter(Boolean).join(","),
    VKD3D_DEBUG: caller.VKD3D_DEBUG || "info",
    VKD3D_LOG_FILE:
      caller.VKD3D_LOG_FILE ||
      "Z:" + join(state, "logs/vkd3d.log").replaceAll("/", "\\"),
    VKD3D_SHADER_CACHE_PATH:
      caller.VKD3D_SHADER_CACHE_PATH ||
      "Z:" + join(state, "shader-cache").replaceAll("/", "\\"),
    // The descriptor-buffer path loses character geometry and HUD text on
    // the tested native NVK runtime. An explicit diagnostic option can opt in.
    DXVK_CONFIG: ["dxvk.enableDescriptorBuffer = False", caller.DXVK_CONFIG]
      .filter(Boolean)
      .join(";"),
    NVK_HUD: hudEnabled && d3d12 ? caller.NVK_HUD ?? "fps,frametimes" : "0",
    // Wine PE child processes retain WINE_* in their Unix environment.
    WINE_NVK_HUD:
      hudEnabled && d3d12 ? caller.NVK_HUD ?? "fps,frametimes" : "0",
    DXVK_HUD:
      hudEnabled && !d3d12
        ? caller.DXVK_HUD ?? "devinfo,fps,frametimes,scale=1.25"
        : "0",
  };
}

export function graphicsArguments(
  backend: string | undefined,
  supportsD3d12: boolean | undefined,
  requestedD3d12: boolean,
  requestedNVKD3d12 = false
): string[] {
  if (backend === "dxvk-nvk") {
    if (!requestedNVKD3d12) return ["-force-d3d11"];
    if (!supportsD3d12)
      throw new Error(
        "Update the driver Wine/NVK runtime for vkd3d-proton D3D12."
      );
    return ["-use-d3d12"];
  }
  return requestedD3d12 && supportsD3d12 === true ? ["-use-d3d12"] : [];
}

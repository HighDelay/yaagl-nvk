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

export function nvkOverrides(previous = ""): string {
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
          name =>
            !["d3d11", "dxgi"].includes(
              name.toLowerCase().replace(/\.dll$/, "")
            )
        );
      return names.length ? names.join(",") + clause.slice(equals) : "";
    })
    .filter(Boolean);
  return [...preserved, "d3d11,dxgi=n"].join(";");
}

export function nvkEnvironment(
  root: string,
  state: string,
  caller: Record<string, string>,
  hudEnabled = true
): Record<string, string> {
  return {
    ...caller,
    DYLD_LIBRARY_PATH: join(root, "lib"),
    DYLD_PRINT_LIBRARIES: "1",
    WINEDEBUG: [
      caller.WINEDEBUG || "fixme-all,err-unwind,+timestamp",
      "+pid,+loaddll",
    ].join(","),
    WINEDLLOVERRIDES: nvkOverrides(caller.WINEDLLOVERRIDES),
    TMPDIR: join(state, "tmp"),
    MESA_SHADER_CACHE_DIR: join(state, "shader-cache"),
    XDG_CACHE_HOME: join(state, "cache"),
    XDG_CONFIG_HOME: join(state, "config"),
    XDG_DATA_HOME: join(state, "data"),
    DXVK_LOG_PATH: caller.DXVK_LOG_PATH || join(state, "logs"),
    DXVK_LOG_LEVEL: "info",
    // The descriptor-buffer path loses character geometry and HUD text on
    // the tested native NVK runtime. An explicit diagnostic option can opt in.
    DXVK_CONFIG: ["dxvk.enableDescriptorBuffer = False", caller.DXVK_CONFIG]
      .filter(Boolean)
      .join(";"),
    DXVK_HUD: hudEnabled
      ? caller.DXVK_HUD ?? "devinfo,fps,frametimes,scale=1.25"
      : "0",
  };
}

export function graphicsArguments(
  backend: string | undefined,
  supportsD3d12: boolean | undefined,
  requestedD3d12: boolean
): string[] {
  if (backend === "dxvk-nvk") return ["-force-d3d11"];
  return requestedD3d12 && supportsD3d12 === true ? ["-use-d3d12"] : [];
}

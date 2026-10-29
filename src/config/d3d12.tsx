import { Box, Checkbox, FormControl, FormLabel, Text } from "@hope-ui/solid";
import { createEffect, createSignal, Show } from "solid-js";
import type { Locale } from "@locale";
import { assertValueDefined, getKey, setKey } from "@utils";
import { NOOP } from "@config/config-def";
import type { Config } from "@config/config-def";
import type { Wine } from "@wine";

declare module "@config/config-def" {
  interface Config {
    useD3D12: boolean;
    useNVKD3D12: boolean;
    useNVKDLSS: boolean;
  }
}

const CONFIG_KEY = "config_use_d3d12";

// This is a shared Wine preference; each client owns its renderer launch arguments.
export async function createD3D12({
  locale,
  config,
  wine,
  supportsD3d12,
  nativeNVK,
}: {
  locale: Locale;
  config: Partial<Config>;
  wine?: Wine;
  supportsD3d12?: () => boolean;
  nativeNVK?: () => boolean;
}) {
  try {
    config.useD3D12 = (await getKey(CONFIG_KEY)) == "true";
  } catch {
    config.useD3D12 = false;
  }

  const [value, setValue] = createSignal(config.useD3D12);
  try {
    config.useNVKD3D12 = (await getKey("config_use_d3d12_nvk")) == "true";
  } catch {
    config.useNVKD3D12 = false;
  }
  const [nativeValue, setNativeValue] = createSignal(config.useNVKD3D12);
  try {
    config.useNVKDLSS = (await getKey("config_use_dlss_nvk")) == "true";
  } catch {
    config.useNVKDLSS = false;
  }
  const [dlss, setDLSS] = createSignal(config.useNVKDLSS);
  const isNative = () =>
    nativeNVK ? nativeNVK() : wine?.attributes.renderBackend === "dxvk-nvk";
  createEffect(() => {
    const next = nativeValue();
    if (config.useNVKD3D12 !== next) {
      config.useNVKD3D12 = next;
      void setKey("config_use_d3d12_nvk", next ? "true" : "false");
    }
  });
  createEffect(() => {
    const next = dlss();
    if (config.useNVKDLSS !== next) {
      config.useNVKDLSS = next;
      void setKey("config_use_dlss_nvk", String(next));
    }
  });

  async function onSave(apply: boolean) {
    assertValueDefined(config.useD3D12);
    if (!apply) {
      setValue(config.useD3D12);
      return NOOP;
    }
    if (config.useD3D12 == value()) return NOOP;
    config.useD3D12 = value();
    await setKey(CONFIG_KEY, config.useD3D12 ? "true" : "false");
    return NOOP;
  }

  createEffect(() => {
    value();
    onSave(true);
  });

  return [
    function UI() {
      return (
        <>
          <FormControl id="d3d12">
            <FormLabel>{locale.get("SETTING_D3D12_RUN")}</FormLabel>
            <Box>
              <Checkbox
                checked={isNative() ? nativeValue() : value()}
                disabled={
                  supportsD3d12
                    ? !supportsD3d12()
                    : wine?.attributes.supportsD3d12 !== true
                }
                onChange={() =>
                  isNative() ? setNativeValue(x => !x) : setValue(x => !x)
                }
                size="md"
              >
                {locale.get("SETTING_D3D12")}
                {isNative() ? " (vkd3d-proton, experimental)" : ""}
              </Checkbox>
            </Box>
          </FormControl>
          <Show when={isNative()}>
            <FormControl id="nvkDLSS">
              <FormLabel>DLSS support (experimental)</FormLabel>
              <Checkbox
                checked={dlss()}
                disabled={!nativeValue()}
                size="md"
                onChange={() => setDLSS(value => !value)}
              >
                Enable NVIDIA NGX / NVAPI
              </Checkbox>
              <Text size="xs" color="$neutral10">
                Requires D3D12, an RTX GPU and the matching driver runtime.
                Select DLSS quality in the game. Frame generation uses the
                game's hardware checks and has not been verified.
              </Text>
            </FormControl>
          </Show>
        </>
      );
    },
  ] as const;
}

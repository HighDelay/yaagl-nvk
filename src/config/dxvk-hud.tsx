import { Box, Checkbox, FormControl, FormLabel, Text } from "@hope-ui/solid";
import { createEffect, createSignal } from "solid-js";
import type { Locale } from "@locale";
import { getKeyOrDefault, setKey } from "@utils";
import type { Config } from "./config-def";

declare module "./config-def" {
  interface Config {
    dxvkHud: boolean;
  }
}

export async function createDXVKHUDConfig({
  locale,
  config,
}: {
  config: Partial<Config>;
  locale: Locale;
}) {
  config.dxvkHud =
    (await getKeyOrDefault("config_dxvkHud", "true")) !== "false";
  const [value, setValue] = createSignal(config.dxvkHud);

  createEffect(() => {
    const enabled = value();
    if (config.dxvkHud === enabled) return;
    config.dxvkHud = enabled;
    void setKey("config_dxvkHud", String(enabled));
  });

  return [
    function UI() {
      return (
        <FormControl id="dxvkHud">
          <FormLabel>{locale.get("SETTING_DXVK_HUD")}</FormLabel>
          <Box>
            <Checkbox
              checked={value()}
              size="md"
              onChange={() => setValue(enabled => !enabled)}
            >
              {locale.get("SETTING_ENABLED")}
            </Checkbox>
          </Box>
          <Text size="xs" color="$neutral10">
            {locale.get("SETTING_DXVK_HUD_DESC")}
          </Text>
        </FormControl>
      );
    },
  ] as const;
}

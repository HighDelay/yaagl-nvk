import { getKeyOrDefault, setKey } from "../utils";
import { NVK_RUNTIME_ID } from "../wine/nvk-contract";

export const RECOMMENDED_WINE_TAG = "11.0-1-crossover-signed-experimental";
export const RECOMMENDED_WINE_URL =
  "https://github.com/yaagl/anime-game-wine/releases/download/wine-crossover-11.0-1-signed/wine-crossover-11.0-1-osx64-signed.tar.xz";

export async function applyRecommendedSettings(
  channelClient = String(import.meta.env["YAAGL_CHANNEL_CLIENT"]),
  preferredWineTag?: string
) {
  const currentWineState = await getKeyOrDefault("wine_state", "");
  const currentWineTag = await getKeyOrDefault("wine_tag", "");

  const native = (preferredWineTag ?? currentWineTag) === NVK_RUNTIME_ID;
  const recommendedTag = native ? NVK_RUNTIME_ID : RECOMMENDED_WINE_TAG;
  const recommendedUrl = native ? "local://nvk-runtime" : RECOMMENDED_WINE_URL;

  if (currentWineState !== "ready" || currentWineTag !== recommendedTag) {
    await setKey("wine_state", "update");
    await setKey("wine_update_tag", recommendedTag);
    await setKey("wine_update_url", recommendedUrl);
  }

  if (native) {
    // These startup workarounds were tested for ZZZ. HSR and GI use their
    // ordinary routes unless the user explicitly enables an option.
    const workarounds = channelClient === "napos" || channelClient === "napcn";
    await setKey("config_steam_patch", String(workarounds));
    await setKey("config_timeout_fix", String(workarounds));
    await setKey("config_block_net", "false");
    return recommendedTag;
  }

  if (channelClient.startsWith("hk4e") || channelClient.startsWith("nap")) {
    await setKey("config_steam_patch", "true");
    await setKey("config_timeout_fix", "true");
    await setKey("config_block_net", "false");
  }

  if (channelClient.startsWith("hkrpg")) {
    await setKey("config_block_net", "true");
  }
  return recommendedTag;
}

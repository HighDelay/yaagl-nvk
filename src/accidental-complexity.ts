import { Locale } from "@locale";
import { env, log } from "@utils";
import { join, normalize } from "path-browserify";

export async function createGameInstallationDirectorySanitizer({
  openFolderDialog,
  locale,
}: {
  openFolderDialog: () => Promise<string>;
  locale: Locale;
}) {
  const HOME = await env("HOME");
  await log(`HOME:` + HOME);
  const forbiddenDirectories = [
    "/Applications",
    ...["Desktop", "Downloads", "Documents", "Applications"].map(name =>
      join(HOME, name)
    ),
  ];

  async function selectPath(): Promise<string> {
    retry: for (;;) {
      const selection = await openFolderDialog();
      if (!selection) {
        return "";
      }
      if (!selection.startsWith("/")) {
        await locale.alert("PATH_INVALID", "PLEASE_SELECT_A_DIR");
        continue;
      }
      const path = normalize(selection);
      const segments = path.split("/").slice(1);
      if (
        forbiddenDirectories.some(
          directory => path === directory || path.startsWith(directory + "/")
        )
      ) {
        await locale.alert("PATH_INVALID", "PATH_INVALID_FORBIDDEN_DIR");
        continue;
      }
      for (const seg of segments) {
        // FIXME
        // eslint-disable-next-line no-control-regex
        if (!/^[\x00-\x7F]*$/.test(seg)) {
          await locale.alert("PATH_INVALID", "PATH_INVALID_ASCII_ONLY");
          continue retry;
        }
      }
      return path;
    }
  }

  return {
    selectPath,
  };
}

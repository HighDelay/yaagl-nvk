#!/bin/bash
set -eu
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
task_root="$(cd "$script_dir/../../.." && pwd -P)"
if [ "$#" -gt 0 ]; then
  if [ "$#" -ne 2 ] || [ "$1" != "--yaagl-root" ] || [[ "$2" != /* ]]; then
    printf '%s\n' 'Invalid launcher location. Use Start YAAGL NVK.command.' >&2
    exit 1
  fi
  # LaunchServices may relocate only the downloaded .app. The Start command
  # passes its original folder so data remains outside that read-only mount.
  task_root="$(cd -- "$2" && pwd -P)"
fi
data_root="$task_root/launcher-data"
if [ ! -f "$data_root/neutralino.config.json" ]; then
  /usr/bin/osascript -e 'display alert "Start YAAGL NVK from its extracted folder" message "Open Start YAAGL NVK.command beside the app. Keep the app and launcher-data folder together." as critical'
  exit 1
fi
mkdir -p "$data_root/logs" "$data_root/nvk-state/tmp"
cd "$data_root"
export TMPDIR="$data_root/nvk-state/tmp"
export PATH_LAUNCH="$task_root/@APP_NAME@"
exec "$script_dir/Yaagl" --path="$data_root" >> "$data_root/logs/launcher-console.log" 2>&1

#!/bin/bash
set -eu
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec /usr/bin/osascript -l JavaScript "$task_root/update-launcher.js" --source "$task_root" "$@"

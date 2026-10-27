#!/bin/bash
set -eu
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec /usr/bin/open "$task_root/@APP_NAME@" --args --yaagl-root "$task_root"

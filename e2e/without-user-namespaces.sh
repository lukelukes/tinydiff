#!/usr/bin/env bash
set -euo pipefail

if ! unshare --user true 2> /dev/null; then
    exec "$@"
fi

exec unshare --user --map-users=0:0:65536 --map-groups=0:0:65536 -- \
    bash -c 'echo 0 > /proc/sys/user/max_user_namespaces && exec "$@"' bash "$@"

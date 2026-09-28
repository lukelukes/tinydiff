#!/bin/sh

proc="$1"

sysctl_value() {
    if [ -r "$proc/sys/$1" ]; then
        cat "$proc/sys/$1"
    else
        echo "$2"
    fi
}

if [ -L "$proc/self/ns/user" ] &&
    [ "$(sysctl_value kernel/unprivileged_userns_clone 1)" != 0 ] &&
    [ "$(sysctl_value user/max_user_namespaces 0)" -gt 0 ]; then
    echo 755
else
    echo 4755
fi

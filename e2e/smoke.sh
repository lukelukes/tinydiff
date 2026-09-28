#!/usr/bin/env bash
set -euo pipefail

executable="$1"
scratch="$(mktemp -d)"
app=""

cleanup() {
    if [ -n "$app" ]; then
        kill -KILL -- "-$app" 2> /dev/null || true
        wait "$app" 2> /dev/null || true
    fi
    rm -rf "$scratch"
}
trap cleanup EXIT

fail() {
    echo "$executable: $1" >&2
    sed 's/^/stderr: /' "$scratch/stderr.log" >&2
    exit 1
}

running() {
    kill -0 "$app" 2> /dev/null
}

repo="$scratch/repo"
git init -q "$repo"
printf 'export const version = 1;\n' > "$repo/greeter.ts"
git -C "$repo" add greeter.ts
git -C "$repo" -c user.name=smoke -c user.email=smoke@example.invalid commit -q -m initial
printf 'export const version = 2;\n' > "$repo/greeter.ts"

setsid "$executable" --ozone-platform=x11 --user-data-dir="$scratch/profile" "$repo" > /dev/null 2> "$scratch/stderr.log" &
app=$!

window=""
for _ in $(seq 1 120); do
    running || fail "exited before showing a window"
    window="$(xdotool search --onlyvisible --name '^TinyDiff$' 2> /dev/null | head -n 1 || true)"
    if [ -n "$window" ]; then
        break
    fi
    sleep 0.5
done
if [ -z "$window" ]; then
    fail "showed no window within 60 seconds"
fi

pid="$(xdotool getwindowpid "$window")"
args="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
if [ -z "$args" ]; then
    fail "the command line of window process $pid is unreadable"
fi
if [[ "$args" == *--no-sandbox* ]]; then
    fail "runs without the sandbox: $args"
fi

kill -TERM "$app"
for _ in $(seq 1 20); do
    running || break
    sleep 0.5
done
if running; then
    fail "ignored SIGTERM for 10 seconds"
fi
status=0
wait "$app" || status=$?
app=""
if [ "$status" -ne 0 ]; then
    fail "exited with status $status after SIGTERM"
fi
if grep -q 'FATAL:' "$scratch/stderr.log"; then
    fail "logged a fatal error"
fi

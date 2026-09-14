#!/usr/bin/env bash
set -euo pipefail

package="$1"
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq --no-install-recommends "$package" git xauth xdotool xvfb > /dev/null

sysctl_value() {
    if [ -r "/proc/sys/$1" ]; then
        cat "/proc/sys/$1"
    else
        echo "$2"
    fi
}

if [ -L /proc/self/ns/user ] &&
    [ "$(sysctl_value kernel/unprivileged_userns_clone 1)" != 0 ] &&
    [ "$(sysctl_value user/max_user_namespaces 0)" -gt 0 ]; then
    echo "userns yes"
else
    echo "userns no"
fi

echo "helper $(stat -c %a /opt/TinyDiff/chrome-sandbox)"
echo "launcher $(readlink -f /usr/bin/tinydiff)"

find /opt/TinyDiff -type f | while read -r file; do
    head -c 4 "$file" | grep -q ELF || continue
    ldd "$file" 2> /dev/null |
        sed -n "s|^[[:space:]]*\([^[:space:]]*\) => not found|unresolved $file \1|p"
done

useradd --create-home tester
su - tester -c "git init -q repo &&
    cd repo &&
    printf 'export const version = 1;\n' > greeter.ts &&
    git -c user.name=e2e -c user.email=e2e@example.com add greeter.ts &&
    git -c user.name=e2e -c user.email=e2e@example.com commit -q -m initial &&
    printf 'export const version = 2;\n' > greeter.ts"

cat > /home/tester/start.sh << 'START'
set -u
tinydiff --ozone-platform=x11 "$HOME/repo" > /dev/null 2> "$HOME/stderr.log" &
app=$!
window=""
for _ in $(seq 1 120); do
    window="$(xdotool search --onlyvisible --name '^TinyDiff$' 2> /dev/null | head -n 1)"
    [ -n "$window" ] && break
    kill -0 "$app" 2> /dev/null || break
    sleep 0.5
done
if [ -z "$window" ]; then
    echo "window none"
else
    echo "user $(id -u)"
    echo "args $(tr '\0' ' ' < "/proc/$(xdotool getwindowpid "$window")/cmdline")"
fi
kill -TERM "$app" 2> /dev/null || true
wait "$app"
echo "exit $?"
sed 's/^/stderr /' "$HOME/stderr.log"
START

su - tester -c 'xvfb-run -a bash "$HOME/start.sh"'

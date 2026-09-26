#!/usr/bin/env bash
set -euo pipefail

package="$1"
install_dir="$2"
executable="$3"
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq --no-install-recommends "$package" > /dev/null

echo "helper $(stat -c %a "$install_dir/chrome-sandbox")"
echo "launcher $(readlink -f "$(command -v "$executable")")"

find "$install_dir" -type f | while read -r file; do
    head -c 4 "$file" | grep -q ELF || continue
    { ldd "$file" 2> /dev/null || true; } |
        sed -n "s|^[[:space:]]*\([^[:space:]]*\) => not found|unresolved $file \1|p"
done

apt-get install -y -qq --no-install-recommends git xauth xdotool xvfb > /dev/null
useradd --create-home tester

if su tester -c 'unshare --user --map-root-user true' 2> /dev/null; then
    echo "userns yes"
else
    echo "userns no"
fi

if su - tester -c "xvfb-run -a bash /smoke.sh $executable" >&2; then
    echo "started yes"
else
    echo "started no"
fi

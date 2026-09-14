# tinydiff

A desktop application to view Git diffs and perform GitHub style code reviews. The GUI is an Electron app with a React renderer talking to the Rust core through an N-API addon.

## Development

- `just gui::dev <path>` runs the app against a repository with hot reload.
- `bun validate` formats, lints, typechecks, builds, and runs the unit, property, and browser tests.
- `just gui::e2e` builds the app and runs the Electron end-to-end suite.

## Packaging

`just gui::package` builds the renderer, main, and preload bundles, then produces `release/TinyDiff-<version>-x86_64.AppImage` and `release/TinyDiff-<version>-amd64.deb` with electron-builder. The N-API addon ships unpacked next to the asar under `resources/app.asar.unpacked/out/main/chunks/`.

`just gui::e2e-package` runs the end-to-end suite against `release/linux-unpacked/tinydiff`. The suite first checks that the packaged binary ships with the hardening fuses set, then works on a temporary copy with only the Node CLI inspect fuse re-enabled. `just gui::smoke` launches the untouched AppImage and the binary extracted from the deb against a temporary repository, waits for the window, and checks that each exits cleanly on `SIGTERM` with the sandbox on. It runs in its own `xvfb-run -a` server and starts both artifacts with `--ozone-platform=x11`, so it behaves the same in an X11 session, a Wayland session, and on a headless machine.

Both artifacts inherit the glibc of the machine that builds them, and the addon links the vendored libgit2 and OpenSSL that the Rust core builds from source. The supported baseline is **glibc 2.38** (Debian 13, Ubuntu 24.04, Fedora 39 or newer). The deb declares `libc6 (>= 2.38)`, so `apt` refuses an install that could not start; the AppImage carries no metadata, so check `ldd --version` before running it on an older distribution. `just gui::smoke` reads the highest `GLIBC_` symbol version out of every binary in both artifacts and fails unless it matches that baseline and the dependency the deb declares, so a build host with a different glibc cannot ship a package that lies about its requirements.

The AppImage relies on Chromium's sandbox. `build/AppRun` replaces electron-builder's launcher, which would otherwise pass `--no-sandbox` whenever unprivileged user namespaces look unavailable. On distributions that restrict them, extract the AppImage (`./TinyDiff-<version>-x86_64.AppImage --appimage-extract`) and make the bundled helper setuid root (`chown root:root squashfs-root/chrome-sandbox && chmod 4755 squashfs-root/chrome-sandbox`) instead of launching with `--no-sandbox`. The deb does this on install through `build/after-install.tpl`, which replaces electron-builder's `unshare --user` probe: that probe runs as root, and root is exempt from `kernel.unprivileged_userns_clone`, so it reported working namespaces on the very systems where ordinary users have none. The replacement reads `kernel.unprivileged_userns_clone` and `user.max_user_namespaces` instead and falls back to the setuid helper whenever they are missing or disabled.

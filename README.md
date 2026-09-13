# tinydiff

A desktop application to view Git diffs and perform GitHub style code reviews. The GUI is an Electron app with a React renderer talking to the Rust core through an N-API addon.

## Development

- `just gui::dev <path>` runs the app against a repository with hot reload.
- `bun validate` formats, lints, typechecks, builds, and runs the unit, property, and browser tests.
- `just gui::e2e` builds the app and runs the Electron end-to-end suite.

## Packaging

`just gui::package` builds the renderer, main, and preload bundles, then produces `release/TinyDiff-<version>-x86_64.AppImage` and `release/TinyDiff-<version>-amd64.deb` with electron-builder. The N-API addon ships unpacked next to the asar under `resources/app.asar.unpacked/out/main/chunks/`. When `target/release/td` exists it is bundled as `resources/bin/td`.

`just gui::e2e-package` runs the end-to-end suite against `release/linux-unpacked/tinydiff`. The packaged binary has the Node CLI inspect fuse disabled, so the suite works on a temporary copy with only that fuse re-enabled.

The AppImage relies on Chromium's sandbox. On distributions that restrict unprivileged user namespaces, extract the AppImage (`./TinyDiff-<version>-x86_64.AppImage --appimage-extract`) and make the bundled helper setuid root (`chown root:root squashfs-root/chrome-sandbox && chmod 4755 squashfs-root/chrome-sandbox`) instead of launching with `--no-sandbox`. The deb sets this up on install.

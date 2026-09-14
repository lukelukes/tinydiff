set quiet
set shell := ["bash", "-euo", "pipefail", "-c"]

e2e_runner := if env("DISPLAY", "") != "" { "" } else if env("WAYLAND_DISPLAY", "") != "" { "" } else { "xvfb-run -a" }

version := `bun --print "require('./package.json').version"`
machine := `uname -m`
appimage := "release/TinyDiff-" + version + "-" + (if machine == "x86_64" { "x86_64" } else { "arm64" }) + ".AppImage"
deb := "release/TinyDiff-" + version + "-" + (if machine == "x86_64" { "amd64" } else { "arm64" }) + ".deb"
unpacked := "release/linux-" + (if machine == "x86_64" { "" } else { "arm64-" }) + "unpacked"

[private]
addon:
    just napi::build

[group('dev')]
[no-exit-message]
dev *args: addon
    bun electron-vite dev -w --sourcemap -- {{ args }}

[group('dev')]
build: addon
    bun electron-vite build

[group('dev')]
[no-exit-message]
preview *args: addon
    bun electron-vite preview -- {{ args }}

[group('dev')]
browsers:
    bunx playwright install chromium

[group('test')]
e2e: build
    {{ e2e_runner }} bun vitest run --project e2e

[group('test')]
e2e-package: package
    ls {{ unpacked }}/tinydiff > /dev/null
    TD_E2E_BINARY={{ unpacked }}/tinydiff {{ e2e_runner }} bun vitest run --project e2e

[group('test')]
smoke: package
    TD_ARTIFACT_APPIMAGE={{ appimage }} TD_ARTIFACT_DEB={{ deb }} xvfb-run -a bun vitest run --project e2e e2e/packaged-smoke.spec.ts

[group('dist')]
package: build
    bun run package
    ls {{ appimage }} {{ deb }} > /dev/null
    TD_ARTIFACT_APPIMAGE={{ appimage }} TD_ARTIFACT_DEB={{ deb }} bun vitest run --project e2e e2e/packaged-artifacts.spec.ts

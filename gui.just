set quiet
set shell := ["bash", "-euo", "pipefail", "-c"]

td := "target/release/td"
e2e_runner := if env("DISPLAY", "") != "" { "" } else if env("WAYLAND_DISPLAY", "") != "" { "" } else { "xvfb-run -a" }

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
    TD_E2E_BINARY=release/linux-unpacked/tinydiff {{ e2e_runner }} bun vitest run --project e2e

[group('dist')]
package: build
    if [[ -x "{{ td }}" ]]; then bun run package -c.extraResources.from="{{ td }}" -c.extraResources.to=bin/td; else bun run package; fi

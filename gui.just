set quiet
set shell := ["bash", "-euo", "pipefail", "-c"]

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
    if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then xvfb-run -a bun vitest run --project e2e; else bun vitest run --project e2e; fi

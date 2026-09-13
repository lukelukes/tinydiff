set quiet
set shell := ["bash", "-euo", "pipefail", "-c"]

[group('dev')]
[no-exit-message]
dev *args:
    bun electron-vite dev -w --sourcemap -- {{ args }}

[group('dev')]
build:
    bun electron-vite build

[group('dev')]
[no-exit-message]
preview *args:
    bun electron-vite preview -- {{ args }}

[group('dev')]
browsers:
    bunx playwright install chromium

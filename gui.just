set quiet
set shell := ["bash", "-euo", "pipefail", "-c"]

e2e_runner := if env("DISPLAY", "") != "" { "" } else if env("WAYLAND_DISPLAY", "") != "" { "" } else { "xvfb-run -a" }

[private]
addon:
    just napi::build

[group('dev')]
[no-exit-message]
dev *args: addon
    bun electron-vite dev -w --sourcemap -- {{ args }}

[group('dev')]
build:
    bun run electron:build

[group('dev')]
[no-exit-message]
preview *args: addon
    bun electron-vite preview -- {{ args }}

[group('dev')]
browsers:
    bunx playwright install chromium

[group('test')]
e2e: build
    {{ e2e_runner }} bun run test:e2e

[group('test')]
e2e-package: package
    {{ e2e_runner }} bun vitest run --config vitest.packaged.config.ts --project e2e-package

[group('test')]
smoke: package
    bun vitest run --config vitest.packaged.config.ts --project packaged e2e/packaged-smoke.spec.ts

[group('test')]
deb-install: package
    bun vitest run --config vitest.packaged.config.ts --project packaged e2e/packaged-install.spec.ts

[group('dist')]
package: build
    bun run package
    bun vitest run --config vitest.packaged.config.ts --project packaged e2e/packaged-artifacts.spec.ts

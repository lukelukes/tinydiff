set quiet
set shell := ["bash", "-euo", "pipefail", "-c"]

mod cargo 'crates/tinydiff-tauri/justfile'
mod gpui 'crates/tinydiff-gpui/justfile'
mod napi 'crates/tinydiff-napi/justfile'
mod gui

[default]
help:
    just --list

[group('lint')]
audit:
    cargo audit

[group('lint')]
deny:
    cargo deny check

[group('lint')]
machete:
    cargo machete

[group('lint')]
typos:
    typos

[group('lint')]
[parallel]
lint: audit deny machete typos

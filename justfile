mod cargo 'crates/tinydiff-tauri/justfile'
mod gpui 'crates/tinydiff-gpui/justfile'

help:
    just --list

audit:
    cargo audit

deny:
    cargo deny check

machete:
    cargo machete

typos:
    typos

lint: audit deny machete typos

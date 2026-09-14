## Description

An Electron/React desktop application to view Git diffs in an aesthetic way and perform GitHub style code reviews. The Rust core is loaded into the Electron main process through an N-API addon.

## Constraints

- Do not leave comments, ever, for any reason
- Commits and pull request titles use semantic commit format: `type(scope): summary`, with types feat, fix, refactor, build, chore, docs, test, perf
- We use `just` and `bun` to run tasks
  - All you need is: `just cargo::<check|build>`, `just napi::check`, `just gui::<dev|build>` and `bun validate`

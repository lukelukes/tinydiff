# tinydiff

A Tauri/React desktop application to view Git diffs in an aesthetic way and perform GitHub-style code reviews.

## Features

- View staged and unstaged changes
- Syntax highlighting for 100+ languages
- Split and unified diff views
- Code review comments with anchoring
- Persistent settings
- Dark mode support

## Development

```bash
bun install
bun run dev
```

For browser-only development (without Tauri):

```bash
bun run dev:browser
```

## Building

```bash
bun run build
just cargo::build
```

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri v2
- **Diff Engine**: @pierre/diffs with web worker support

## License

MIT

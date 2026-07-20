# Contributing

Thanks for helping improve Kimi Usage Tracker.

## Before opening a change

- Search existing issues first.
- Keep changes focused and easy to review.
- Never attach real Kimi logs, prompts, API keys, configuration files, or personal paths.
- Use generated test records with obvious placeholder values.

## Development

Requirements: Node.js 22 or later, Rust stable, and the platform prerequisites from the [Tauri documentation](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm test
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Run the desktop application from the repository root:

```bash
npm run tauri -- dev
```

## Pull requests

Explain what changed, why it is needed, and how it was tested. Add focused tests for scanner, pricing, or formatting behavior. UI changes should include a screenshot made with synthetic data only.

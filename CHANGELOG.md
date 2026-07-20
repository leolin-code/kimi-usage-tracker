# Changelog

## Unreleased

- Detect Kimi Code data across `KIMI_CODE_HOME`, `HOME`, and `USERPROFILE`, and recover from stale saved paths.
- Publish a raw Windows `.exe` and a universal macOS `.dmg` to the rolling Edge release after every successful `main` build.
- Build the Windows release as a desktop GUI executable without an extra console window.

## 0.1.0 - 2026-07-20

- Add a read-only Kimi Code `usage.record` scanner.
- Add token, cache, model, trend, and recent-request views.
- Add first-party Kimi API Platform pricing with source metadata.
- Resolve common environment model names and custom `config.toml` aliases before pricing.
- Resolve Kimi Code's `__kimi_env_model__` placeholder from bounded per-session model logs.
- Show estimated cost for each recent request.
- Add a local-calendar “Today” range.
- Bound scanned log lines and model groups so malformed data cannot grow memory indefinitely.
- Add public contribution, security, issue, CI, and Windows build documentation.
- Add an Apple Silicon macOS portable build workflow.

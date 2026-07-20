# Kimi Usage Tracker

An unofficial, local-only desktop dashboard for Kimi Code token and cache usage.

Kimi Usage Tracker reads the normalized `usage.record` entries already written by Kimi Code. It does not proxy requests, modify Kimi Code configuration, read prompt text, or upload usage data.

## Features

- Input, output, cache-read, and cache-creation token totals
- Cache hit rate, daily trend, per-model totals, and per-request estimated costs
- Official Kimi API Platform pricing for supported pay-as-you-go models
- Model alias resolution for `config.toml` entries and common `KIMI_MODEL_NAME` values such as `k3`
- Explicitly leaves `kimi-for-coding` unpriced because it is a subscription/quota product
- Automatic discovery of `~/.kimi-code` and support for `KIMI_CODE_HOME`
- A directory picker for alternate Kimi Code data roots
- Bounded line parsing for large JSONL journals
- Safety limits for scanned lines, model groups, configuration, and session logs

## macOS Preview

The first preview targets Apple Silicon Macs running macOS 11 or later.

1. Download `Kimi-Usage-Tracker-macOS-arm64.zip` from the [latest release](https://github.com/leolin-code/kimi-usage-tracker/releases/latest).
2. Extract the archive.
3. Open `Kimi Usage Tracker.app`.

The preview build is not notarized. If macOS blocks the first launch, Control-click the app, choose **Open**, and confirm once.

After opening the app, it automatically reads `~/.kimi-code`. Use the folder button in the top-right corner only when your Kimi Code data is stored elsewhere.

## Windows

There is no prebuilt Windows download in the first release. Windows users can build a portable `.exe` by following [docs/build-windows.md](docs/build-windows.md). No installer is required after the build.

## Data Source

The app scans:

```text
$KIMI_CODE_HOME/sessions/*/*/agents/*/wire.jsonl
$KIMI_CODE_HOME/sessions/*/*/logs/kimi-code.log*
```

When `KIMI_CODE_HOME` is unset, it defaults to:

```text
macOS/Linux: ~/.kimi-code
Windows:     %USERPROFILE%\.kimi-code
```

Only records whose exact type is `usage.record` are aggregated. Session logs are consulted only when Kimi Code records its reserved `__kimi_env_model__` alias; the app extracts the corresponding `model` / `modelAlias` fields from bounded `llm config` lines. Prompt messages, tool arguments, code, credentials, and response text are ignored.

Model names are normalized before grouping and pricing. The app reads only the `model` field under `[models."<alias>"]` from a bounded `config.toml`, so a recorded alias such as `my-k3` can be grouped under `kimi-k3`. Environment-defined models are resolved from their per-session model mapping because Kimi Code does not persist `KIMI_MODEL_NAME` into `config.toml`. Provider keys and configuration contents are never displayed or logged.

## Pricing

Built-in prices come from the official Kimi API Platform documentation and use CNY per 1,000,000 tokens. See [docs/pricing.md](docs/pricing.md) for the current table, source URLs, and product distinction.

Costs are estimates for public pay-as-you-go model IDs. The dashboard shows both model totals and an estimate for each recent request. Provider invoices remain the source of truth.

## Development

Prerequisites:

- Node.js 22 or later
- Rust stable
- Xcode Command Line Tools on macOS

Run the desktop app:

```bash
npm install
npm run tauri -- dev
```

Run tests:

```bash
npm test
npm run build
cd src-tauri && cargo test
```

Contribution instructions are in [CONTRIBUTING.md](CONTRIBUTING.md).

Build the macOS portable archive:

```bash
./scripts/package-macos.sh
```

## Privacy

Kimi Usage Tracker performs usage scanning and aggregation locally. The current release makes no application-level network requests. Official prices are compiled into the binary with their source URLs and verification date.

## Status

This is an early macOS preview. Windows portable packaging and incremental on-disk indexing are planned after the scanner and dashboard have been validated with real Kimi Code sessions.

## License

[MIT](LICENSE)

Kimi Usage Tracker is not affiliated with or endorsed by Moonshot AI. Kimi and Kimi Code are trademarks of their respective owner.

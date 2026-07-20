#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
target="${CARGO_TARGET_DIR:-$project_dir/src-tauri/target}"
app="$target/release/bundle/macos/Kimi Usage Tracker.app"
release_dir="$project_dir/release"
archive="$release_dir/Kimi-Usage-Tracker-macOS-arm64.zip"
cache_root="${TMPDIR:-/tmp}"

export CARGO_HOME="${CARGO_HOME:-$cache_root/kimi-usage-tracker-cargo-home}"
export npm_config_cache="${npm_config_cache:-$cache_root/kimi-usage-tracker-npm-cache}"

cd "$project_dir"
npm ci
npm run tauri -- build --bundles app

if [[ ! -d "$app" ]]; then
  echo "macOS app bundle was not created: $app" >&2
  exit 1
fi

codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"

mkdir -p "$release_dir"
COPYFILE_DISABLE=1 ditto -c -k --keepParent --norsrc "$app" "$archive"

shasum -a 256 "$archive"

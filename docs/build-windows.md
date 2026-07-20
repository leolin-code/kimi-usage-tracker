# Build on Windows

Kimi Usage Tracker does not require an installer. Download `Kimi-Usage-Tracker-Windows-x64.exe` from the [Edge release](https://github.com/leolin-code/kimi-usage-tracker/releases/tag/edge), or build it locally on Windows 10 or Windows 11.

The Edge release is rebuilt automatically after every successful push to `main`. Windows may show a SmartScreen warning because the executable is not code-signed. Check that its SHA-256 matches `SHA256SUMS.txt`, then choose **More info** and **Run anyway** if you trust the download.

## Requirements

Install these tools first:

1. [Node.js 22 LTS](https://nodejs.org/)
2. [Rust](https://www.rust-lang.org/tools/install) using the default MSVC toolchain
3. [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**
4. Microsoft Edge WebView2 Runtime, which is already included with most current Windows systems

## Build

Open PowerShell in the project directory and run:

```powershell
git clone https://github.com/leolin-code/kimi-usage-tracker.git
cd kimi-usage-tracker
npm ci
npm test
npm run tauri -- build --no-bundle
```

The portable application will be created at:

```text
src-tauri\target\release\kimi-usage-tracker.exe
```

You can move that `.exe` to another folder or computer. The target computer must have WebView2 Runtime installed.

## Development mode

```powershell
npm run tauri -- dev
```

The application checks `KIMI_CODE_HOME`, `%HOME%\.kimi-code`, and `%USERPROFILE%\.kimi-code` automatically. If a previously selected directory no longer works, it falls back to the detected default. You can always choose another directory with the folder button inside the app.

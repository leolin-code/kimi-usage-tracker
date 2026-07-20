# Build on Windows

Kimi Usage Tracker does not require an installer. You can build a portable executable on Windows 10 or Windows 11.

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

The application reads `%USERPROFILE%\.kimi-code` by default. If your Kimi Code data is elsewhere, choose that directory with the folder button inside the app.

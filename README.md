# AI CLI Auth Manager

Windows desktop app for installing and launching the official authentication flows for:

- Claude Code
- Gemini CLI
- Codex CLI

The app does not read, copy, or store provider tokens. It launches the official CLIs in PowerShell windows and reports install/version checks from command output.

## Running on Another Windows Laptop

Use the generated MSI or NSIS installer from the Windows build. The installed desktop app is self-contained, but the three official CLIs still require Node.js/npm and internet access when they are installed or authenticated.

On a new laptop:

1. Install `AI CLI Auth Manager`.
2. Open `Setup Check`.
3. Run checks for Node.js, npm, npm registry, and auth pages.
4. If Node.js is missing, use `Open Node.js download`.
5. If the laptop is behind a company proxy or alternate registry, set:
   - Registry, for example `https://registry.npmjs.org/`
   - Proxy, for example `http://user:pass@proxy.company.com:8080`
6. Install and log in to each CLI.

The app supports different internet environments by passing the registry/proxy values directly to install commands:

```powershell
npm install -g <package> --registry <registry> --proxy <proxy> --https-proxy <proxy>
```

Browser OAuth still depends on the network allowing these domains:

- `claude.ai`
- `accounts.google.com`
- `auth.openai.com`
- `registry.npmjs.org`

## Requirements

- Windows 10 or newer
- WebView2 runtime
- Node.js 20 or newer
- npm
- Rust stable, only needed when building locally

## Development

```powershell
npm install
npm run tauri:dev
```

## Build Windows Installer

```powershell
npm install
npm run tauri:build
```

Build outputs:

- `src-tauri\target\release\bundle\msi\*.msi`
- `src-tauri\target\release\bundle\nsis\*.exe`

## GitHub Actions Build

Push this project to GitHub and run `Windows Build` from the Actions tab. The workflow uploads both MSI and NSIS installers as artifacts.

## Authentication Behavior

Install buttons run official npm packages:

```powershell
npm install -g @anthropic-ai/claude-code
npm install -g @google/gemini-cli
npm install -g @openai/codex
```

When registry/proxy values are set in `Setup Check`, they are appended to these commands.

Login buttons run official CLI flows:

```powershell
claude
gemini
codex --login
```

Claude also includes a separate `claude setup-token` helper for CI token generation.

## Optional opencode Config

The opencode config action writes:

```powershell
%USERPROFILE%\.config\opencode\opencode.json
```

It creates a minimal provider block for Anthropic, Google, and OpenAI. It does not import credentials from any CLI.

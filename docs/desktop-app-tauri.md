# Reckon Desktop App (Tauri)

Status: **working dev build** (scaffolded 2026-08-09). The web app runs in a
native window via Tauri 2. This doc covers how it's wired, how to run/build it,
and what's left before shipping.

## What it is

Tauri wraps the existing `Reckon-app` (Vite + React) in a native desktop shell
using the OS webview (WebKit on macOS, WebView2 on Windows) — no bundled
Chromium, so installs are small (~10MB vs Electron's ~150MB). It is the **same
web app**: it talks to `reckon_api` over HTTP exactly like the browser version,
so there are **no backend changes**.

- Rust: 1.97.1 (installed via rustup)
- Tauri: 2.11.x (`@tauri-apps/cli`, `@tauri-apps/api`, `src-tauri/`)
- App identifier: `com.reckonio.desktop`
- Default window: 1400×900 (min 900×600)

## Layout

```
Reckon-app/
  src/            # the React app (unchanged; shared with web + mobile-facing API)
  dist/           # vite build output — loaded by the packaged desktop app
  src-tauri/
    tauri.conf.json   # window, identifier, dev/build commands, CSP
    Cargo.toml        # Rust deps (committed)
    Cargo.lock        # committed for reproducible builds
    src/              # Rust entrypoint (default; no custom native code yet)
    icons/            # app icons (PLACEHOLDER — see below)
    target/           # build artifacts (gitignored)
```

## Running & building

```bash
# Dev: opens a native window with hot-reload (starts Vite via beforeDevCommand)
npm run tauri:dev

# Package a distributable (.dmg / .app on macOS, .msi / .exe on Windows)
npm run tauri:build
# → src-tauri/target/release/bundle/
```

First `tauri:build` (or `tauri:dev`) is slow — Rust compiles all Tauri crates
from scratch (~5–10 min). Subsequent builds are incremental and fast.

Requires Rust on PATH: `source "$HOME/.cargo/env"` if `cargo` isn't found.

## Config notes

- `beforeDevCommand: npm run dev`, `beforeBuildCommand: npm run build` — Tauri
  drives the Vite build itself.
- `devUrl: http://localhost:5173`, `frontendDist: ../dist`.
- The API base URL still comes from `VITE_API_URL` (defaults to
  `https://api.reckonio.com/v1`), same as web. Point it at a local backend the
  same way (`.env`).

## Already done (offline readiness)

- **pdf.js worker bundled locally** — `planMediaLoader.ts` imports the worker
  via `pdfjs-dist/build/pdf.worker.min.mjs?url` instead of the unpkg CDN, so the
  takeoff canvas works with no network in the packaged app. The PWA service
  worker + IndexedDB plan cache (already shipped for web) also carry over.

## TODO before shipping

### 1. Tighten the Content-Security-Policy (security) — HIGH
`tauri.conf.json` has `"csp": null` (allows all connections). Fine for dev; for
release, allowlist only what the app actually talks to:
- API: `https://api.reckonio.com` (and the dev URL when testing)
- Images: `https://res.cloudinary.com`
- Analytics: `https://matomo.benjys.me` (or drop Matomo in desktop — it's a web
  analytics tool and adds little value in a desktop shell)

Example `security.csp`:
```
"default-src 'self'; connect-src 'self' https://api.reckonio.com https://res.cloudinary.com; img-src 'self' data: blob: https://res.cloudinary.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
```
Verify the canvas, plan loading, and export still work after tightening — the
webview is stricter than a browser tab.

### 2. Real app icons — MEDIUM
`src-tauri/icons/` are Tauri's placeholder icons. Generate the full set from the
Reckon logo:
```bash
npm run tauri icon path/to/reckon-logo-1024.png
```
Needs a square PNG ≥ 1024×1024.

### 3. Auth token storage — MEDIUM
The app keeps the JWT in `localStorage`. That works in the desktop webview, but
for a "real app" feel consider the OS keychain via a Tauri plugin
(`tauri-plugin-stronghold` or `tauri-plugin-keychain`). Optional; localStorage is
acceptable for v1.

### 4. Auto-update — LOW (later)
Tauri has a built-in updater (`tauri-plugin-updater`) that checks a release feed
and self-updates — the Figma-style silent update. Needs a signing key and a
hosted `latest.json`. Add when there's a release pipeline.

### 5. Windows build — LOW
macOS is verified. A Windows `.msi`/`.exe` needs a Windows machine (or CI) with
Rust + WebView2. Nothing app-specific should change; just untested.

### 6. Code signing / notarization — before public distribution
- macOS: Apple Developer ID cert + notarization, or users hit Gatekeeper.
- Windows: an Authenticode cert, or SmartScreen warns.
Not needed for internal testing.

## Not doing (out of scope)

- Native menus / tray beyond the default window chrome (add if wanted).
- Deep OS integration (file associations, protocol handlers).
- Replacing any web behavior with native — the whole point is it's the same app.

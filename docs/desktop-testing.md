# Desktop app — building & sharing test builds

The desktop app is [Tauri 2](https://tauri.app). It bundles native installers
per OS. **Tauri can't cross-compile** — each OS's installer must be built on
that OS, which is why we use CI to produce all three.

## Building locally (quickest, your own OS only)

```bash
cd Reckon-app
npm run tauri:build
```

Output lands in `src-tauri/target/release/bundle/`:

| Built on | Files | Give testers |
| --- | --- | --- |
| macOS | `dmg/Reckon_*.dmg`, `macos/Reckon.app` | the `.dmg` |
| Windows | `msi/*.msi`, `nsis/*-setup.exe` | the `.exe` |
| Linux | `deb/*.deb`, `appimage/*.AppImage` | the `.AppImage` |

## Building all platforms via CI (recommended)

`.github/workflows/desktop-release.yml` builds macOS + Windows + Linux and
attaches the installers to a GitHub **Release**.

**To cut a build:**
```bash
# bump the version first (see below), then:
git tag v0.1.0
git push origin v0.1.0
```
Or trigger it manually: repo → **Actions** → **Desktop release** → **Run
workflow** (creates a *draft* release you publish when ready).

Testers then go to the repo's **Releases** page and download the installer for
their OS. It uses the built-in `GITHUB_TOKEN`, so no secrets to configure.

## The unsigned-app warning (tell your testers)

These builds are **not code-signed** (signing needs paid Apple/Windows certs).
Testers will see a scary-looking prompt the first time — it's harmless:

- **macOS:** "Reckon can't be opened because it is from an unidentified
  developer." → **Right-click the app → Open → Open**. (Once per install.)
  If macOS still blocks it: `xattr -cr /Applications/Reckon.app` in Terminal.
- **Windows:** "Windows protected your PC" (SmartScreen) → **More info → Run
  anyway**.
- **Linux (.AppImage):** `chmod +x Reckon_*.AppImage` then double-click / run it.

Signing removes these warnings but is a separate, paid setup — worth doing
before a public launch, not for internal testing.

## Version bumps

The version lives in **two** files — keep them in sync:
- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`

The Release is named after the git tag you push (`v0.1.0`).

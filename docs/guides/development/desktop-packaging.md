# Desktop packaging

Shared file selection lives in [`electron-builder.yml`](../../../electron-builder.yml).
The macOS CI configuration extends it, so exclusions apply to every platform.

The package excludes the repository-root `dist/` and `logs/` trees and root files
matching `*.log*`. These are build outputs and local diagnostics. Git ignore
rules do not control Electron Builder file selection. Keep packaging exclusions
in the builder configuration; local logs remain on disk.

## macOS build time

`pnpm build:mac` builds the Swift helper, runs Electron Vite, then packages and
signs the app and creates DMG and ZIP artifacts. It does not run TypeScript
checks; run `pnpm run typecheck` separately for release verification.

Reduce archive input before changing compression. Inspect `app.asar` to ensure
local diagnostics are absent, and retain `out/`, production dependencies and
the resources declared by `extraResources`.

Electron Builder 26.4.0 uses ZIP Deflate level 7 for normal compression.
The local `build:mac` script sets `ELECTRON_BUILDER_COMPRESSION_LEVEL=1` for
Electron Builder, so faster compression is enabled with:

```sh
pnpm build:mac
```

This trades archive size for speed. The shared builder configuration and
`build:mac:ci` retain Electron Builder's default compression.
Measure both size and time before changing shared defaults. For app-only local
verification, `pnpm exec electron-builder --mac --dir` skips DMG/ZIP generation;
it uses the existing compiled output, so build that output first when needed.

On 2026-09-30, sequential ZIP tests on the same unsigned arm64 app measured
57.51 seconds / 268.5 MiB at level 7 and 4.26 seconds / 283.3 MiB at level 1.
Both archives passed `7za t`. The app was 723 MiB with a 256 MiB `app.asar`;
`logs/`, `dist/` and root log files were absent, while compiled output,
production dependencies and extra resources were present. These measurements
exclude signing, DMG generation and block maps; they are not a full build time.

## macOS signing selection

`mac.signIgnore` skips data resources under `Resources/` with the extensions
`pak`, `nib`, `dat`, `bin`, `webp`, `icns`, `onnx` and `asar`. Their containing
bundles seal these resources. Executables, native modules and frameworks still
receive code signatures.

The four bundled frameworks (Electron Framework, Mantle, ReactiveObjC and
Squirrel) are signed through their physical `Versions/A/` paths. Their root
aliases and `Versions/Current/` aliases are skipped to avoid signing the same
code repeatedly. Recheck this layout when upgrading Electron; a change to the
physical version directory requires updating the selection rule.

After changing these rules, run a full signed build and verify:

```sh
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/at-i.app
```

Also check packaged native module loading, helper diagnostics and app startup.
On 2026-09-30, signing selection reduced candidates from 789 to 50 and signing
time from 291.04 seconds to 19.85 seconds. The full build took 51.44 seconds,
compared with 324.25 seconds before this selection change. Notarization remained
disabled in both builds.

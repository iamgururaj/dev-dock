---
name: electron-build
description: Build, package, and reduce Electron application size; use for release artifacts, dependency bundling, and packaged-app verification.
metadata:
  version: '1.0.0'
  short-description: 'Lean Electron builds and verified packages'
  tags: 'electron,build,packaging,bundle-size'
---

# Electron Build

Read the repository's build scripts, Vite config, electron-builder config, and CI before changing packaging. Preserve platform targets, signing, runtime assets, and requested functionality. Skill version is separate from application version; do not bump the app or publish a release unless requested.

## Build lean

- Measure installer, unpacked app, ASAR contents, and compiled output separately. State MB/MiB consistently; raw file savings do not predict compressed installer savings.
- Renderer tree shaking does not stop electron-builder from copying complete production packages. Avoid shipping both bundled UI code and full icon/UI dependency trees.
- With compatible electron-vite versions, use `build.externalizeDeps: false` for bundleable main/preload JavaScript and minify production output. Electron and Node built-ins stay external. Keep sandboxed preload dependencies bundled.
- Keep native addons and packages requiring runtime files external when necessary; explicitly include their transitive runtime files and verify packaged loading. Do not blindly exclude all node_modules unless runtime dependencies are fully bundled.
- Prefer a packaging allowlist: compiled output, runtime assets, metadata, and licenses. Exclude source, tests, temp/browser profiles, build caches, and unused source maps. Preserve third-party notices when bundling dependencies.
- Retain only product-supported Electron locales; for an English-only app use `electronLanguages: [en-US, en-GB]`. Do not discard required font coverage accidentally.
- Chromium binaries cannot be tree-shaken like JavaScript. Avoid deleting graphics/media/ICU files indiscriminately; stronger compression mainly affects download size. Custom Electron builds or a framework migration require separate scope.

## Verify and report

- Run repository checks and relevant tests, then build the requested artifact. Build macOS artifacts on a supported macOS host; report platforms actually exercised.
- Inspect the finished ASAR and locale directory against the intended package contents. Check main/preload for unexpected external npm imports.
- Launch the packaged app with an isolated test profile; verify renderer, assets, preload, and representative IPC. A successful compile or spawned process alone does not establish runtime success.
- If terminal execution is affected, exercise the actual launcher with paths containing spaces/quotes: verify working directory, install exit status before dev, readiness/failure reporting, and no launch when disabled. Clean up only test-owned processes.
- If downloads fail, distinguish network failure from code failure. A matching installed Electron distribution can be supplied via `--config.electronDist=node_modules/electron/dist`; this does not provide missing installer tools. Retry only after changing the cause, and respect execution permissions.
- Report before/after sizes, artifact paths, checks, and untested platforms. Check whether CI actually invokes existing tests; propose a focused guardrail when missing.

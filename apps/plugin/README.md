# Plugin App (HTML-only)

This folder contains the packaged Figma plugin:

- `plugin-src/`: plugin main thread code (compiled to `dist/code.js`)
- `ui-src/`: plugin UI (compiled to `dist/index.html`)

## Build

From the repo root:

```bash
pnpm -C apps/plugin build
```

Or build just the main thread bundle:

```bash
pnpm -C apps/plugin build:main
```

## Notes

- This fork is **HTML-only** (including JSX/Svelte/styled-components modes).
- Framework tabs and Email UI have been removed from the plugin UI.

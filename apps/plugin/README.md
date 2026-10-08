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

## Tests

```bash
pnpm -C apps/plugin test
```

The regression tests cover HTML text and attribute escaping, rotated node dimensions,
nested frame/group coordinates, and preview bounds using a mocked Figma API.

## Notes

- Both the plugin window and Dev Mode generate **HTML with inline CSS**.
- Export settings cover layer names, CSS color variables, embedded images, and SVGs.
- Saved settings from earlier versions are filtered to the supported HTML options when loaded.

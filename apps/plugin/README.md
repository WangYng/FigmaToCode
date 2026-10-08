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
nested frame/group coordinates, reflections and affine transforms, SVG viewport
compensation, preview bounds, and text/button sizing using a mocked Figma API.

SVG exports request `contentsOnly: true` and `useAbsoluteBounds: true` so placement
uses a geometry-based export rectangle. The inline SVG viewport is normalized to
its viewBox size and mapped back to node-local coordinates before the normal HTML
parent transforms apply. Render bounds expand standalone previews for effects;
they are not substituted for the SVG export origin. SVG Assets retains the original
export string. Browser tests with synthetic SVG exports cover transform composition;
actual Figma exports with strokes, shadows, and clipping still require visual checks.


## Notes

- Both the plugin window and Dev Mode generate **HTML with inline CSS**.
- Export settings cover layer names, CSS color variables, embedded images, and SVGs.
- Saved settings from earlier versions are filtered to the supported HTML options when loaded.

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
They also cover hidden fills, linear-gradient geometry, and preview-only overflow
bounds. Exported components keep their layout dimensions; preview canvases can
expand to include overflowing children and effects.

SVG exports request `contentsOnly: true` and `useAbsoluteBounds: true` so placement
uses a geometry-based export rectangle. The inline SVG viewport is normalized to
its viewBox size and mapped back to node-local coordinates before the normal HTML
parent transforms apply. Render bounds expand standalone previews for effects;
they are not substituted for the SVG export origin. SVG Assets retains the original
export string. Browser tests with synthetic SVG exports cover transform composition;
actual Figma exports with strokes, shadows, and clipping still require visual checks.

Transparent artwork uses a contour drop shadow for simple outer shadows; ordinary
boxes retain box shadows and text retains text shadows. Layer blur never creates
a shadow. With vector embedding enabled, complex artwork shadows (inner shadows,
spread, multiple shadows, non-normal blend modes, or incompatible translucent
shadow behavior) use native SVG export even above the icon size limit. Text
layouts remain HTML. If native export is unavailable, unsupported shadow effects
are omitted with a warning rather than replaced by a rectangular shadow.

## Notes

- Both the plugin window and Dev Mode generate **HTML with inline CSS**.
- Export settings cover layer names, CSS color variables, embedded images, and SVGs.
- Saved settings from earlier versions are filtered to the supported HTML options when loaded.

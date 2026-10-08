const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { buildSync } = require("esbuild");

const backend = path.resolve(__dirname, "../../../packages/backend/src");
const bundle = buildSync({
  stdin: {
    contents: [
      `export { nodesToJSON } from ${JSON.stringify(`${backend}/altNodes/jsonNodeConversion.ts`)};`,
      `export { htmlMain, generateHTMLPreview } from ${JSON.stringify(`${backend}/html/htmlMain.ts`)};`,
      `export { getNodeGeometry } from ${JSON.stringify(`${backend}/common/nodeGeometry.ts`)};`,
      `export { relativeToParent, getTransformedBounds, cssMatrix } from ${JSON.stringify(`${backend}/common/nodeGeometry.ts`)};`,
      `export { getSVGGeometry, svgForHTML } from ${JSON.stringify(`${backend}/common/svgGeometry.ts`)};`,
      `export { retrieveSVGAssets } from ${JSON.stringify(`${backend}/common/retrieveUI/retrieveSVGAssets.ts`)};`,
      `export { htmlShadow } from ${JSON.stringify(`${backend}/html/builderImpl/htmlShadow.ts`)};`,
      `export { needsNativeShadow } from ${JSON.stringify(`${backend}/common/nodeShadow.ts`)};`,
      `export { buildBackgroundValues, htmlGradientFromFills } from ${JSON.stringify(`${backend}/html/builderImpl/htmlColor.ts`)};`,
    ].join("\n"),
    resolveDir: backend,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
}).outputFiles[0].text;

function runtime(figmaOverrides = {}) {
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module,
    exports: module.exports,
    require,
    console: { log() {}, warn() {}, error() {} },
    figma: {
      mixed: Symbol("mixed"),
      ui: { postMessage() {} },
      ...figmaOverrides,
    },
    setTimeout,
  });
  return module.exports;
}

const settings = {
  showLayerNames: true,
  embedImages: false,
  embedVectors: false,
  embedVectorsMaxSize: 64,
  useColorVariables: false,
  responsiveRoot: false,
};

function rotation(angle, x = 0, y = 0) {
  const radians = (angle * Math.PI) / 180;
  return [
    [Math.cos(radians), -Math.sin(radians), x],
    [Math.sin(radians), Math.cos(radians), y],
  ];
}

function compose(parent, child) {
  return parent.map((row) => [
    row[0] * child[0][0] + row[1] * child[1][0],
    row[0] * child[0][1] + row[1] * child[1][1],
    row[0] * child[0][2] + row[1] * child[1][2] + row[2],
  ]);
}

function near(actual, expected, message = "") {
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${message}: ${actual} != ${expected}`,
  );
}

let nextId = 0;
function liveNode(properties = {}) {
  const node = {
    id: String(++nextId),
    name: "Rectangle",
    type: "RECTANGLE",
    visible: true,
    width: 100,
    height: 50,
    absoluteTransform: rotation(0),
    relativeTransform: rotation(0),
    fills: [],
    strokes: [],
    effects: [],
    opacity: 1,
    blendMode: "NORMAL",
    ...properties,
  };
  node.exportAsync = async () => ({ document: jsonNode(node) });
  return node;
}

function jsonNode(node) {
  const transform = node.absoluteTransform;
  const corners = [
    [0, 0],
    [node.width, 0],
    [0, node.height],
    [node.width, node.height],
  ].map(([x, y]) => transform.map((row) => row[0] * x + row[1] * y + row[2]));
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    fills: node.fills,
    strokes: node.strokes,
    effects: node.effects,
    opacity: node.opacity,
    blendMode: node.blendMode,
    absoluteBoundingBox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    layoutMode: node.layoutMode ?? "NONE",
    clipsContent: node.clipsContent,
    layoutWrap: node.layoutWrap ?? "NO_WRAP",
    layoutSizingHorizontal: node.layoutSizingHorizontal ?? "FIXED",
    layoutSizingVertical: node.layoutSizingVertical ?? "FIXED",
    minWidth: node.minWidth,
    ...(node.children ? { children: node.children.map(jsonNode) } : {}),
    ...(node.type === "TEXT"
      ? { style: { textAutoResize: node.textAutoResize ?? "NONE" } }
      : {}),
  };
}

function textNode(segments, properties = {}) {
  return liveNode({
    type: "TEXT",
    name: "Text",
    getStyledTextSegments: () => structuredClone(segments),
    ...properties,
  });
}

function segment(characters, properties = {}) {
  return {
    characters,
    fontSize: 16,
    fontName: { family: "Arial", style: "Regular" },
    fontWeight: 400,
    fills: [],
    textCase: "ORIGINAL",
    textDecoration: "NONE",
    lineHeight: { unit: "AUTO" },
    letterSpacing: { unit: "PIXELS", value: 0 },
    openTypeFeatures: {},
    ...properties,
  };
}

test("plain text remains literal HTML text, including entities and line breaks", async () => {
  const api = runtime();
  const source = "<b>文本</b> &copy; &lt; & < > \" ' 😀\r\n下一行\n末行";
  const nodes = await api.nodesToJSON([textNode([segment(source)])], settings);
  const expected =
    "&lt;b&gt;文本&lt;/b&gt; &amp;copy; &amp;lt; &amp; &lt; &gt; &quot; &#39; 😀<br/>下一行<br/>末行";
  for (const output of [
    (await api.htmlMain(nodes, settings)).html,
    (await api.generateHTMLPreview(nodes, settings)).content,
  ]) {
    assert.ok(output.includes(expected));
    assert.ok(!output.includes("<b>"));
    assert.ok(!output.includes("&amp;amp;copy;"));
  }
  assert.equal(nodes[0].styledTextSegments[0].characters, source);
});

test("rich text preserves sub/sup styling without allowing text or attribute injection", async () => {
  const api = runtime();
  const nodes = await api.nodesToJSON(
    [
      textNode(
        [
          segment('<img src=x onerror="alert(1)">', {
            fontName: { family: '"Odd & Font"', style: "Regular" },
          }),
          segment("2<3", { openTypeFeatures: { SUPS: true } }),
          segment("&copy;", { openTypeFeatures: { SUBS: true } }),
        ],
        { name: 'Text" onmouseover="alert(1)' },
      ),
    ],
    settings,
  );
  const { html } = await api.htmlMain(nodes, settings);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('" onmouseover="'));
  assert.ok(
    html.includes('data-layer="Text&quot; onmouseover=&quot;alert(1)"'),
  );
  assert.ok(html.includes("font-family: &quot;Odd &amp; Font&quot;"));
  assert.match(html, /<sup style="[^"]*">2&lt;3<\/sup>/);
  assert.match(html, /<sub style="[^"]*">&amp;copy;<\/sub>/);
});

test("auto-width Chinese text preserves HUG and cannot wrap or shrink in a narrow flex row", async () => {
  const api = runtime();
  const label = textNode([segment("保持自然宽度"), segment("\n手动换行")], {
    textAutoResize: "WIDTH_AND_HEIGHT",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
  });
  const row = liveNode({
    type: "FRAME",
    width: 24,
    layoutMode: "HORIZONTAL",
    layoutWrap: "NO_WRAP",
    children: [label],
  });
  const nodes = await api.nodesToJSON([row], settings);
  assert.equal(nodes[0].children[0].layoutSizingHorizontal, "HUG");
  assert.equal(nodes[0].children[0].layoutSizingVertical, "HUG");
  for (const output of [
    (await api.htmlMain(nodes, settings)).html,
    (await api.generateHTMLPreview(nodes, settings)).content,
  ]) {
    assert.match(output, /white-space: nowrap/);
    assert.match(output, /flex-shrink: 0/);
    assert.ok(output.includes("<br/>手动换行"));
  }
});

test("fixed-width auto-height text still wraps inside a NO_WRAP container", async () => {
  const api = runtime();
  const paragraph = textNode([segment("固定宽度的正文仍然允许换行")], {
    width: 48,
    textAutoResize: "HEIGHT",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "HUG",
  });
  const row = liveNode({
    type: "FRAME",
    layoutMode: "HORIZONTAL",
    layoutWrap: "NO_WRAP",
    children: [paragraph],
  });
  const nodes = await api.nodesToJSON([row], settings);
  assert.equal(nodes[0].children[0].layoutSizingVertical, "HUG");
  for (const output of [
    (await api.htmlMain(nodes, settings)).html,
    (await api.generateHTMLPreview(nodes, settings)).content,
  ]) {
    assert.match(output, /width: 48px/);
    assert.doesNotMatch(output, /white-space: nowrap|flex-shrink: 0/);
  }
});

test("nested FILL buttons use their allocated width without a content-based minimum", async () => {
  const api = runtime();
  const button = liveNode({
    name: "Button",
    type: "FRAME",
    width: 80,
    layoutMode: "HORIZONTAL",
    layoutSizingHorizontal: "FILL",
    children: [
      textNode([segment("确认并继续")], {
        textAutoResize: "WIDTH_AND_HEIGHT",
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "HUG",
      }),
    ],
  });
  const row = liveNode({
    type: "FRAME",
    width: 200,
    layoutMode: "HORIZONTAL",
    children: [liveNode({ width: 120 }), button],
  });
  const nodes = await api.nodesToJSON([row], settings);
  for (const output of [
    (await api.htmlMain(nodes, settings)).html,
    (await api.generateHTMLPreview(nodes, settings)).content,
  ]) {
    const style = output.match(/data-layer="Button"[^>]*style="([^"]*)"/)[1];
    assert.match(style, /flex: 1 1 0/);
    assert.match(style, /min-width: 0px/);
    assert.match(output, /white-space: nowrap; flex-shrink: 0/);
  }
});

test("FILL minimum-width fallback preserves explicit constraints and does not affect FIXED or HUG", async () => {
  const api = runtime();
  for (const [sizing, minWidth] of [
    ["FILL", 96],
    ["FILL", 0],
    ["FIXED", undefined],
    ["HUG", undefined],
  ]) {
    const button = liveNode({
      name: "Button",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      layoutSizingHorizontal: sizing,
      minWidth,
      children: [textNode([segment("确认")])],
    });
    const nodes = await api.nodesToJSON(
      [
        liveNode({
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [button],
        }),
      ],
      settings,
    );
    const { html } = await api.htmlMain(nodes, settings);
    const style = html.match(/data-layer="Button"[^>]*style="([^"]*)"/)[1];
    if (minWidth !== undefined) {
      assert.match(style, new RegExp(`min-width: ${minWidth}px`));
      assert.equal((style.match(/min-width:/g) ?? []).length, 1);
    } else {
      assert.doesNotMatch(style, /min-width:/);
    }
  }
});

test("empty layout containers still receive fixed dimensions", async () => {
  const api = runtime();
  const frame = liveNode({
    type: "FRAME",
    children: [],
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
  });
  const [node] = await api.nodesToJSON([frame], settings);
  assert.equal(node.layoutSizingHorizontal, "FIXED");
  assert.equal(node.layoutSizingVertical, "FIXED");
  const { html } = await api.htmlMain([node], settings);
  assert.match(html, /width: 100px; height: 50px/);
});

test("native dimensions survive critical, negative and fractional rotation angles", async () => {
  const api = runtime();
  for (const angle of [
    0, 30, 37.5, 44.9999, 45, 45.0001, 89.9999, 90, 90.0001, 135, 180, -45, -90,
    -135,
  ]) {
    const original = liveNode({
      absoluteTransform: rotation(angle, 230, -140),
    });
    const nodes = await api.nodesToJSON([original], settings);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].width, 100);
    assert.equal(nodes[0].height, 50);
    near(nodes[0].rotation, -angle, `rotation ${angle}`);
    const { html } = await api.htmlMain(nodes, settings);
    assert.ok(html.includes("width: 100px; height: 50px"));
    assert.ok(!/NaN|Infinity/.test(html));
    assert.equal(original.width, 100);
    assert.equal(original.height, 50);
  }
});

test("positions are relative to a rotated frame, not its page-space bounding box", async () => {
  const api = runtime();
  const parentTransform = [
    [0, -1, 300],
    [1, 0, 400],
  ];
  const child = liveNode({
    absoluteTransform: compose(parentTransform, rotation(45, 12, -24)),
  });
  const parent = liveNode({
    type: "FRAME",
    absoluteTransform: parentTransform,
    children: [child],
  });
  const [converted] = await api.nodesToJSON([parent], settings);
  near(converted.children[0].x, 12);
  near(converted.children[0].y, -24);
  near(converted.children[0].rotation, -45);
  const { html } = await api.htmlMain([converted], settings);
  assert.match(html, /left: 12px; top: -24px; position: absolute/);
  assert.ok(
    html.includes(
      "matrix(0.7071067812, 0.7071067812, -0.7071067812, 0.7071067812, 0, 0)",
    ),
  );
});

test("nested groups keep one rotation per DOM container", async () => {
  const api = runtime();
  const outerTransform = rotation(30, 100, 200);
  const innerTransform = compose(outerTransform, rotation(45, 20, 30));
  const child = liveNode({
    absoluteTransform: compose(innerTransform, rotation(-90, 7, 9)),
  });
  const inner = liveNode({
    type: "GROUP",
    absoluteTransform: innerTransform,
    children: [child],
  });
  const outer = liveNode({
    type: "GROUP",
    absoluteTransform: outerTransform,
    children: [inner],
  });
  // relativeTransform deliberately stays page-relative, as it does under Figma groups.
  child.relativeTransform = child.absoluteTransform;
  inner.relativeTransform = inner.absoluteTransform;
  const [converted] = await api.nodesToJSON([outer], settings);
  const convertedInner = converted.children[0];
  const convertedChild = convertedInner.children[0];
  assert.equal(converted.type, "FRAME");
  assert.equal(convertedInner.type, "FRAME");
  near(converted.rotation, -30);
  near(convertedInner.rotation, -45);
  near(convertedInner.x, 20);
  near(convertedInner.y, 30);
  near(convertedChild.rotation, 90);
  near(convertedChild.x, 7);
  near(convertedChild.y, 9);
});

test("selected rotated roots retain intrinsic dimensions inside a fitted viewport", async () => {
  const api = runtime();
  const [node] = await api.nodesToJSON(
    [liveNode({ absoluteTransform: rotation(90) })],
    settings,
  );
  const preview = await api.generateHTMLPreview([node], settings);
  near(preview.size.width, 50);
  near(preview.size.height, 100);
  assert.ok(
    preview.content.includes(
      'style="position: relative; width: 50px; height: 100px"',
    ),
  );
  assert.ok(
    preview.content.includes(
      "width: 100px; height: 50px; left: 50px; top: 0px",
    ),
  );
  assert.ok(preview.content.includes("matrix(0, 1, -1, 0, 0, 0)"));
  assert.ok(!preview.content.includes("width: 100%"));

  const diagonal = await api.nodesToJSON(
    [liveNode({ absoluteTransform: rotation(45) })],
    settings,
  );
  const diagonalPreview = await api.generateHTMLPreview(diagonal, settings);
  near(diagonalPreview.size.width, 150 / Math.sqrt(2));
  near(diagonalPreview.size.height, 150 / Math.sqrt(2));
});

test("fractional rotations are not rounded to whole degrees", async () => {
  const api = runtime();
  const nodes = await api.nodesToJSON(
    [liveNode({ absoluteTransform: rotation(37.5) })],
    settings,
  );
  const { html } = await api.htmlMain(nodes, settings);
  const coefficients = html
    .match(/transform: matrix\(([^)]+)\)/)[1]
    .split(",")
    .map(Number);
  near(coefficients[0], Math.cos((37.5 * Math.PI) / 180));
  near(coefficients[1], Math.sin((37.5 * Math.PI) / 180));
});

function point(transform, x, y) {
  return transform.map((row) => row[0] * x + row[1] * y + row[2]);
}

function assertMatrix(actual, expected) {
  actual.forEach((row, i) =>
    row.forEach((value, j) => near(value, expected[i][j])),
  );
}

test("full local matrices preserve horizontal/vertical reflection, scale and shear", async () => {
  const api = runtime();
  const parentMatrix = compose(rotation(37.5, 137, 6565), [
    [-1, 0, 0],
    [0, 1, 0],
  ]);
  for (const local of [
    [
      [-1, 0, 74],
      [0, 1, 0],
    ],
    [
      [1, 0, 0],
      [0, -1, 71],
    ],
    [
      [-1, 0, 74],
      [0, -1, 71],
    ],
    compose(rotation(25, 12, 9), [
      [-1, 0, 0],
      [0, 1, 0],
    ]),
    [
      [1.2, 0.3, 12],
      [0.1, 0.8, 9],
    ],
  ]) {
    const child = liveNode({ absoluteTransform: compose(parentMatrix, local) });
    const parent = liveNode({
      type: "GROUP",
      absoluteTransform: parentMatrix,
      children: [child],
    });
    const [converted] = await api.nodesToJSON([parent], settings);
    const convertedChild = converted.children[0];
    assertMatrix(convertedChild.localTransform, local);
    assertMatrix(convertedChild.absoluteTransform, child.absoluteTransform);
    assertMatrix(
      compose(converted.absoluteTransform, convertedChild.localTransform),
      child.absoluteTransform,
    );
    near(convertedChild.x, local[0][2]);
    near(convertedChild.y, local[1][2]);
  }
});

test("mirrored selected roots fit the correct four-corner bounds without a half-turn", async () => {
  const api = runtime();
  for (const matrix of [
    [
      [-1, 0, 137],
      [0, 1, 6565],
    ],
    [
      [1, 0, 137],
      [0, -1, 6565],
    ],
    compose(rotation(35, 137, 6565), [
      [-1, 0, 0],
      [0, 1, 0],
    ]),
  ]) {
    const nodes = await api.nodesToJSON(
      [liveNode({ width: 74, height: 71, absoluteTransform: matrix })],
      settings,
    );
    const preview = await api.generateHTMLPreview(nodes, settings);
    const corners = [
      [0, 0],
      [74, 0],
      [0, 71],
      [74, 71],
    ].map(([x, y]) => point(matrix, x, y));
    near(
      preview.size.width,
      Math.max(...corners.map((p) => p[0])) -
        Math.min(...corners.map((p) => p[0])),
    );
    near(
      preview.size.height,
      Math.max(...corners.map((p) => p[1])) -
        Math.min(...corners.map((p) => p[1])),
    );
    assert.doesNotMatch(preview.content, /rotate\(180/);
    assert.ok(
      preview.content.includes(
        api.cssMatrix([
          [matrix[0][0], matrix[0][1], 0],
          [matrix[1][0], matrix[1][1], 0],
        ]),
      ),
    );
  }
});

function svgFixture() {
  const childLocal = rotation(20, 18, 13);
  const parentMatrix = [
    [-1, 0, 137.00116],
    [0, 1, 6565],
  ];
  const child = liveNode({
    type: "VECTOR",
    name: "Eye",
    width: 12.4,
    height: 8.6,
    absoluteTransform: compose(parentMatrix, childLocal),
  });
  const parent = liveNode({
    type: "GROUP",
    name: "Mirrored group",
    width: 73.92104,
    height: 70.61537,
    absoluteTransform: parentMatrix,
    children: [child],
  });
  const bounds = jsonNode(child).absoluteBoundingBox;
  // Deliberately different render bounds, rounded width/height, and nonzero viewBox.
  child.absoluteRenderBounds = {
    x: bounds.x - 0.312,
    y: bounds.y - 0.312,
    width: bounds.width + 0.624,
    height: bounds.height + 0.624,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width)}" height="${Math.ceil(bounds.height)}" viewBox="-2 3 ${bounds.width} ${bounds.height}"><path d="M-2 3h4v4h-4z"/></svg>`;
  const requests = [];
  const api = runtime({
    getNodeByIdAsync: async (id) => {
      assert.equal(id, child.id);
      return {
        exportAsync: async (options) => {
          requests.push(options);
          return svg;
        },
      };
    },
  });
  return { api, parent, child, bounds, svg, requests };
}

test("nested SVG cancels baked page transforms once and uses explicit geometry export bounds", async () => {
  const { api, parent, child, bounds, svg, requests } = svgFixture();
  const svgSettings = { ...settings, embedVectors: true };
  const nodes = await api.nodesToJSON([parent], svgSettings);
  const { html } = await api.htmlMain(nodes, svgSettings);
  const convertedChild = nodes[0].children[0];
  assert.equal(requests.length, 1);
  assert.equal(requests[0].contentsOnly, true);
  assert.equal(requests[0].useAbsoluteBounds, true);
  const geometry = convertedChild.svgGeometry;
  assert.equal(JSON.stringify(geometry.exportBounds), JSON.stringify(bounds));
  assert.equal(convertedChild.svg, svg);
  const resultingMapping = compose(
    compose(nodes[0].absoluteTransform, convertedChild.localTransform),
    geometry.viewportToLocal,
  );
  for (const [x, y] of [
    [0, 0],
    [bounds.width, 0],
    [0, bounds.height],
    [bounds.width, bounds.height],
  ]) {
    const actual = point(resultingMapping, x, y);
    near(actual[0], bounds.x + x);
    near(actual[1], bounds.y + y);
  }
  assert.match(html, /left: 18px; top: 13px; position: absolute/);
  assert.match(html, /overflow: visible/);
  assert.ok(html.includes('viewBox="-2 3'));
  await api.generateHTMLPreview(nodes, svgSettings);
  assert.equal(requests.length, 1, "preview reuses the SVG export");
  const assets = api.retrieveSVGAssets(nodes);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].svg, svg, "asset copy keeps the unmodified export");
});

test("selected mirrored SVG retains its cache and includes effect bounds in preview", async () => {
  const { api, child, svg, requests } = svgFixture();
  const svgSettings = { ...settings, embedVectors: true };
  const nodes = await api.nodesToJSON([child], svgSettings);
  const preview = await api.generateHTMLPreview(nodes, svgSettings);
  near(preview.size.width, child.absoluteRenderBounds.width);
  near(preview.size.height, child.absoluteRenderBounds.height);
  assert.ok(
    nodes[0].svgGeometry,
    "root wrapper must not lose the original node's SVG metadata",
  );
  assert.equal(api.retrieveSVGAssets(nodes)[0].svg, svg);
  await api.htmlMain(nodes, svgSettings);
  assert.equal(requests.length, 1);
});

test("SVG viewport rounding is compensated without changing nonzero viewBox origin", () => {
  const api = runtime();
  const bounds = { x: 63.08012, y: 6565, width: 12.312, height: 8.624 };
  const transform = [
    [-1, 0, 75.39212],
    [0, 1, 6565],
  ];
  const svg =
    '<svg width="13" height="9" viewBox="-2 3 12.312 8.624"><path/></svg>';
  const geometry = api.getSVGGeometry(svg, bounds, transform);
  assertMatrix(compose(transform, geometry.viewportToLocal), [
    [1, 0, bounds.x],
    [0, 1, bounds.y],
  ]);
  const inline = api.svgForHTML(svg, geometry);
  assert.match(inline, /width="12.312" height="8.624"/);
  assert.match(inline, /viewBox="-2 3 12.312 8.624"/);
  assert.match(inline, /overflow: visible/);
  assert.throws(
    () =>
      api.getSVGGeometry('<svg viewBox="0 0 0 1"></svg>', bounds, transform),
    /invalid viewport/,
  );
  assert.throws(
    () =>
      api.getSVGGeometry(svg, bounds, [
        [0, 0, 0],
        [0, 1, 0],
      ]),
    /singular/,
  );
});

test("mirrored Auto Layout containers retain Flex positioning", async () => {
  const api = runtime();
  const parentMatrix = [
    [-1, 0, 300],
    [0, 1, 50],
  ];
  const child = liveNode({
    name: "Button",
    absoluteTransform: compose(parentMatrix, rotation(0, 20, 10)),
  });
  const parent = liveNode({
    type: "FRAME",
    layoutMode: "HORIZONTAL",
    absoluteTransform: parentMatrix,
    children: [child],
  });
  const nodes = await api.nodesToJSON([parent], settings);
  const { html } = await api.htmlMain(nodes, settings);
  const childStyle = html.match(/data-layer="Button"[^>]*style="([^"]*)"/)[1];
  assert.doesNotMatch(childStyle, /position: absolute|left:|top:|transform:/);
  assert.match(html, /display: inline-flex/);
  assert.match(html, /matrix\(-1, 0, 0, 1, 0, 0\)/);
});

test("SVG icons in Auto Layout reserve their box and keep compensation out of flow", async () => {
  const { api, parent } = svgFixture();
  parent.type = "FRAME";
  parent.layoutMode = "HORIZONTAL";
  const nodes = await api.nodesToJSON([parent], {
    ...settings,
    embedVectors: true,
  });
  const { html } = await api.htmlMain(nodes, {
    ...settings,
    embedVectors: true,
  });
  const style = html.match(/data-layer="Eye"[^>]*style="([^"]*)"/)[1];
  assert.match(style, /width: 12.40px; height: 8.60px/);
  assert.match(style, /position: relative/);
  assert.doesNotMatch(style, /position: absolute|left:|top:/);
  assert.match(
    html,
    /position: absolute; left: 0; top: 0; transform-origin: top left/,
  );
});

test("failed SVG exports fall back to HTML without losing the node transform", async () => {
  const api = runtime({
    getNodeByIdAsync: async () => ({
      exportAsync: async () => {
        throw new Error("export failed");
      },
    }),
  });
  const nodes = await api.nodesToJSON(
    [
      liveNode({
        type: "VECTOR",
        absoluteTransform: [
          [-1, 0, 120],
          [0, 1, 0],
        ],
      }),
    ],
    { ...settings, embedVectors: true },
  );
  const { html } = await api.htmlMain(nodes, {
    ...settings,
    embedVectors: true,
  });
  assert.match(html, /matrix\(-1, 0, 0, 1, 0, 0\)/);
  assert.doesNotMatch(html, /data-svg-wrapper/);
  assert.equal(api.retrieveSVGAssets(nodes).length, 0);
});

function dropShadow(properties = {}) {
  return {
    type: "DROP_SHADOW",
    visible: true,
    blendMode: "NORMAL",
    offset: { x: 0, y: 2.4557 },
    radius: 2.4557,
    color: { r: 0, g: 0, b: 0, a: 0.25 },
    ...properties,
  };
}

function artwork(effects, properties = {}) {
  return liveNode({
    type: "GROUP",
    name: "Artwork",
    width: 120,
    height: 100,
    effects,
    children: [liveNode({ type: "VECTOR", width: 30, height: 30 })],
    ...properties,
  });
}

test("layer blur never produces a box-shadow", async () => {
  const api = runtime();
  const blur = { type: "LAYER_BLUR", radius: 8, visible: true };
  assert.equal(api.htmlShadow({ effects: [blur] }), "");
  assert.equal(
    api.htmlShadow({ effects: [{ ...dropShadow(), visible: false }] }),
    "",
  );
  const nodes = await api.nodesToJSON(
    [liveNode({ effects: [blur] })],
    settings,
  );
  const { html } = await api.htmlMain(nodes, settings);
  assert.match(html, /filter: blur\(4px\)/);
  assert.doesNotMatch(html, /box-shadow|drop-shadow|8px 8px 8px/);
});

test("converted transparent groups use contour shadows and keep blur in the same filter", async () => {
  const api = runtime();
  const nodes = await api.nodesToJSON(
    [artwork([dropShadow(), { type: "LAYER_BLUR", radius: 8, visible: true }])],
    settings,
  );
  assert.equal(nodes[0].type, "FRAME");
  assert.equal(nodes[0].originalType, "GROUP");
  for (const output of [
    (await api.htmlMain(nodes, settings)).html,
    (await api.generateHTMLPreview(nodes, settings)).content,
  ]) {
    const style = output.match(/data-layer="Artwork"[^>]*style="([^"]*)"/)[1];
    assert.match(
      style,
      /filter: drop-shadow\(0px 2.4557px 1.22785px rgba\(0, 0, 0, 0.25\)\) blur\(4px\)/,
    );
    assert.equal((style.match(/filter:/g) ?? []).length, 1);
    assert.doesNotMatch(style, /box-shadow/);
  }
});

test("transparent vector frames use contour shadows but filled cards retain box shadows", async () => {
  const api = runtime();
  for (const filled of [false, true]) {
    const node = artwork([dropShadow()], {
      type: "FRAME",
      fills: filled
        ? [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }]
        : [],
    });
    const nodes = await api.nodesToJSON([node], settings);
    const { html } = await api.htmlMain(nodes, settings);
    if (filled) {
      assert.match(html, /box-shadow:/);
      assert.doesNotMatch(html, /drop-shadow\(/);
    } else {
      assert.match(html, /drop-shadow\(/);
      assert.doesNotMatch(html, /box-shadow:/);
    }
  }
  const nodes = await api.nodesToJSON(
    [liveNode({ effects: [dropShadow({ type: "INNER_SHADOW", spread: 2 })] })],
    settings,
  );
  const { html } = await api.htmlMain(nodes, settings);
  assert.match(html, /box-shadow:.*2px rgba\(0, 0, 0, 0.25\) inset/);
});

test("complex artwork shadows use one native SVG without adding a CSS shadow", async () => {
  for (const effects of [
    [dropShadow({ spread: 2 })],
    [dropShadow({ type: "INNER_SHADOW" })],
    [dropShadow({ blendMode: "MULTIPLY" })],
    [dropShadow(), dropShadow({ offset: { x: 2, y: 0 } })],
  ]) {
    let exports = 0;
    const svg =
      '<svg width="120" height="100" viewBox="0 0 120 100"><defs><filter id="native"><feDropShadow dx="0" dy="2.4557" stdDeviation="1.22785" flood-opacity="0.25"/></filter></defs><circle cx="40" cy="40" r="20" filter="url(#native)"/></svg>';
    const api = runtime({
      getNodeByIdAsync: async () => ({
        exportAsync: async () => {
          exports++;
          return svg;
        },
      }),
    });
    const options = {
      ...settings,
      embedVectors: true,
      embedVectorsMaxSize: 64,
    };
    const nodes = await api.nodesToJSON([artwork(effects)], options);
    assert.equal(
      nodes[0].canBeFlattened,
      true,
      "complex effects override only artwork size heuristics",
    );
    const { html } = await api.htmlMain(nodes, options);
    assert.equal(exports, 1);
    assert.match(html, /feDropShadow/);
    assert.doesNotMatch(html, /box-shadow:|filter: drop-shadow\(/);
    assert.equal(api.retrieveSVGAssets(nodes)[0].svg, svg);
  }
});

test("showShadowBehindNode is preserved for translucent artwork", async () => {
  const api = runtime();
  for (const behind of [undefined, false, true]) {
    const node = artwork([dropShadow({ showShadowBehindNode: behind })]);
    node.children[0].fills = [
      { type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.5 },
    ];
    assert.equal(api.needsNativeShadow(node), behind !== true);
    const nodes = await api.nodesToJSON([node], {
      ...settings,
      embedVectors: true,
    });
    assert.equal(nodes[0].canBeFlattened, behind !== true);
    assert.equal(nodes[0].effects[0].showShadowBehindNode, behind);
  }
});

test("complex effects do not flatten text layouts or reintroduce rectangular fallback shadows", async () => {
  const api = runtime();
  const node = artwork([dropShadow({ blendMode: "MULTIPLY" })], {
    children: [textNode([segment("正文")])],
  });
  const nodes = await api.nodesToJSON([node], {
    ...settings,
    embedVectors: true,
  });
  assert.equal(nodes[0].canBeFlattened, false);
  const { html } = await api.htmlMain(nodes, settings);
  assert.ok(html.includes("正文"));
  assert.doesNotMatch(html, /box-shadow:|filter: drop-shadow\(/);
});

test("text keeps text-shadow without box or contour shadows", async () => {
  const api = runtime();
  const nodes = await api.nodesToJSON(
    [textNode([segment("文字")], { effects: [dropShadow()] })],
    settings,
  );
  const { html } = await api.htmlMain(nodes, settings);
  assert.match(html, /text-shadow:/);
  assert.doesNotMatch(html, /box-shadow:|drop-shadow\(/);
});

function linearGradient(properties = {}) {
  return {
    type: "GRADIENT_LINEAR",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    gradientHandlePositions: [
      { x: 0, y: 0 },
      { x: 0, y: 3.02747 },
      { x: 1, y: 0 },
    ],
    gradientStops: [
      { position: 0, color: { r: 1, g: 1, b: 1, a: 0.5 } },
      { position: 0.273128, color: { r: 0, g: 0, b: 0, a: 1 } },
    ],
    ...properties,
  };
}

test("hidden gradient and image fills stay invisible without removing the node or its blur", async () => {
  const api = runtime();
  for (const fill of [
    linearGradient({ visible: false }),
    { type: "IMAGE", visible: false, imageRef: "hidden" },
  ]) {
    const nodes = await api.nodesToJSON(
      [
        liveNode({
          name: "Hidden fill",
          height: 91,
          fills: [fill],
          absoluteRenderBounds: null,
          effects: [{ type: "LAYER_BLUR", visible: true, radius: 2 }],
        }),
      ],
      settings,
    );
    for (const html of [
      (await api.htmlMain(nodes, settings)).html,
      (await api.generateHTMLPreview(nodes, settings)).content,
    ]) {
      assert.match(html, /data-layer="Hidden fill"/);
      assert.match(html, /filter: blur\(1px\)/);
      assert.doesNotMatch(
        html,
        /background:|linear-gradient|<img|placehold.co/,
      );
    }
    assert.equal(nodes[0].fills[0].visible, false);
  }
  assert.equal(
    api.htmlGradientFromFills(linearGradient({ visible: false })),
    "",
  );
});

test("all gradient types and solid fills share visibility filtering", () => {
  const api = runtime();
  for (const type of [
    "GRADIENT_LINEAR",
    "GRADIENT_RADIAL",
    "GRADIENT_ANGULAR",
    "GRADIENT_DIAMOND",
  ]) {
    assert.equal(
      api.buildBackgroundValues([linearGradient({ type, visible: false })]),
      "",
    );
  }
  const visible = {
    type: "SOLID",
    color: { r: 1, g: 0, b: 0 },
    blendMode: "NORMAL",
  };
  assert.equal(
    api.buildBackgroundValues([linearGradient({ visible: false }), visible]),
    "#FF0000",
  );
  assert.equal(api.buildBackgroundValues([{ ...visible, visible: false }]), "");
});

test("background layers and blend modes omit the same hidden paints", async () => {
  const api = runtime();
  const fills = [
    { type: "SOLID", color: { r: 1, g: 0, b: 0 }, blendMode: "MULTIPLY" },
    linearGradient({ visible: false, blendMode: "SCREEN" }),
    { type: "SOLID", color: { r: 0, g: 0, b: 1 }, blendMode: "NORMAL" },
    linearGradient({ blendMode: "OVERLAY" }),
  ];
  const nodes = await api.nodesToJSON([liveNode({ fills })], settings);
  const { html } = await api.htmlMain(nodes, settings);
  assert.equal((html.match(/linear-gradient\(/g) ?? []).length, 3);
  assert.match(html, /background-blend-mode: overlay, normal, multiply/);
  assert.doesNotMatch(html, /screen/);
});

test("linear gradients retain the Figma axis offset, length and fractional stops", async () => {
  const api = runtime();
  const nodes = await api.nodesToJSON(
    [liveNode({ width: 393, height: 91, fills: [linearGradient()] })],
    settings,
  );
  const { html } = await api.htmlMain(nodes, settings);
  assert.match(html, /linear-gradient\(180deg,/);
  assert.match(html, /82\.688683%/);
  assert.doesNotMatch(html, /black 27%/);
  const shifted = api.htmlGradientFromFills(
    linearGradient({
      gradientHandlePositions: [
        { x: 0, y: -0.2 },
        { x: 0, y: 0.6 },
        { x: 1, y: 0 },
      ],
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
    }),
    { width: 393, height: 91 },
  );
  assert.match(shifted, /#FF0000 -20%/);
  assert.match(shifted, /#0000FF 60%/);
});

test("non-square gradient direction and start/end stops use physical node dimensions", () => {
  const api = runtime();
  const gradient = linearGradient({
    gradientHandlePositions: [
      { x: 0.25, y: 0.5 },
      { x: 0.75, y: 1 },
      { x: 0, y: 1 },
    ],
    gradientStops: [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
  });
  const css = api.htmlGradientFromFills(gradient, { width: 200, height: 100 });
  assert.match(css, /116\.565051deg/);
  assert.match(css, /#FF0000 30%/);
  assert.match(css, /#0000FF 80%/);
  const degenerate = api.htmlGradientFromFills(
    {
      ...gradient,
      gradientHandlePositions: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    },
    { width: 200, height: 100 },
  );
  assert.doesNotMatch(degenerate, /NaN|Infinity/);
});

test("preview includes overflowing children but exported layout keeps its original height", async () => {
  const api = runtime();
  const child = liveNode({
    type: "FRAME",
    name: "Navigation Bar",
    width: 393,
    height: 120,
    children: [liveNode()],
  });
  const parent = liveNode({
    type: "FRAME",
    name: "Navigation",
    width: 393,
    height: 91,
    clipsContent: false,
    children: [child],
    absoluteRenderBounds: { x: 0, y: 0, width: 393, height: 120 },
  });
  const nodes = await api.nodesToJSON([parent], settings);
  const { html } = await api.htmlMain(nodes, settings);
  assert.match(html, /^<div data-layer="Navigation"/);
  assert.match(html, /data-layer="Navigation"[^>]*width: 393px; height: 91px/);
  const preview = await api.generateHTMLPreview(nodes, settings);
  assert.equal(preview.size.height, 120);
  assert.match(
    preview.content,
    /^<div style="position: relative; width: 393px; height: 120px"/,
  );
  assert.match(
    preview.content,
    /data-layer="Navigation"[^>]*width: 393px; height: 91px/,
  );
  assert.equal(
    (await api.htmlMain(nodes, settings)).html,
    html,
    "preview must not mutate exported layout",
  );
});

test("multiple preview roots fit overflow individually without altering exports", async () => {
  const api = runtime();
  const roots = await api.nodesToJSON(
    [
      liveNode({
        name: "First",
        width: 100,
        height: 91,
        absoluteRenderBounds: { x: 0, y: -10, width: 100, height: 130 },
      }),
      liveNode({
        name: "Second",
        width: 100,
        height: 50,
        absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 70 },
      }),
    ],
    settings,
  );
  const preview = await api.generateHTMLPreview(roots, settings);
  assert.equal(preview.size.height, 200);
  assert.match(preview.content, /width: 100px; height: 130px/);
  assert.match(preview.content, /width: 100px; height: 70px/);
  const { html } = await api.htmlMain(roots, settings);
  assert.doesNotMatch(html, /height: 130px|height: 70px/);
  assert.match(html, /height: 91px/);
});

test("hidden fills and null render bounds never remove a container's visible children", async () => {
  const api = runtime();
  const nodes = await api.nodesToJSON(
    [
      liveNode({
        type: "FRAME",
        name: "Container",
        fills: [linearGradient({ visible: false })],
        absoluteRenderBounds: null,
        children: [textNode([segment("可见内容")])],
      }),
    ],
    settings,
  );
  for (const html of [
    (await api.htmlMain(nodes, settings)).html,
    (await api.generateHTMLPreview(nodes, settings)).content,
  ]) {
    assert.match(html, /data-layer="Container"/);
    assert.ok(html.includes("可见内容"));
    assert.doesNotMatch(html, /linear-gradient/);
  }
});

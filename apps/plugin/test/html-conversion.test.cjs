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
    ].join("\n"),
    resolveDir: backend,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
}).outputFiles[0].text;

function runtime() {
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module,
    exports: module.exports,
    require,
    console: { log() {}, warn() {}, error() {} },
    figma: { mixed: Symbol("mixed"), ui: { postMessage() {} } },
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
  assert.ok(html.includes("rotate(45deg)"));
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
  assert.ok(preview.content.includes("rotate(90deg)"));
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
  assert.ok(html.includes("rotate(37.50deg)"));
});

test("SVG exports use their rendered bounds without applying rotation twice", async () => {
  const api = runtime();
  const svg = '<svg width="106" height="106"><path d="M0 0h20v20z"/></svg>';
  const node = {
    ...liveNode(),
    rotation: -45,
    canBeFlattened: true,
    svg,
    absoluteBoundingBox: { x: 0, y: 0, width: 106, height: 106 },
  };
  const preview = await api.generateHTMLPreview([node], {
    ...settings,
    embedVectors: true,
  });
  assert.equal(preview.size.width, 106);
  assert.equal(preview.size.height, 106);
  assert.ok(preview.content.includes(svg));
  assert.ok(!preview.content.includes("rotate("));
});

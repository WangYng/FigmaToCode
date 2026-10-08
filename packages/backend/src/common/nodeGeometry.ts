/** Express a page-space transform in the coordinate system of a DOM parent. */
export const relativeToParent = (
  node: Transform,
  parent: Transform,
): Transform => {
  const [[a, c, x], [b, d, y]] = parent;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) {
    throw new Error("Cannot convert a node inside a singular parent transform");
  }

  const [[na, nc, nx], [nb, nd, ny]] = node;
  const dx = nx - x;
  const dy = ny - y;
  return [
    [
      (d * na - c * nb) / determinant,
      (d * nc - c * nd) / determinant,
      (d * dx - c * dy) / determinant,
    ],
    [
      (a * nb - b * na) / determinant,
      (a * nd - b * nc) / determinant,
      (a * dy - b * dx) / determinant,
    ],
  ];
};

export const getNodeGeometry = (
  node: DimensionAndPositionMixin & { absoluteRenderBounds?: Rect | null },
  parent?: DimensionAndPositionMixin,
) => {
  // Figma's relativeTransform skips groups and boolean operations. Computing
  // this from absolute transforms also works when those become DOM containers.
  const transform = parent
    ? relativeToParent(node.absoluteTransform, parent.absoluteTransform)
    : node.absoluteTransform;

  return {
    absoluteTransform: node.absoluteTransform,
    localTransform: [
      [transform[0][0], transform[0][1], parent ? transform[0][2] : 0],
      [transform[1][0], transform[1][1], parent ? transform[1][2] : 0],
    ] as Transform,
    absoluteRenderBounds: node.absoluteRenderBounds,
    // Original dimensions remain well-defined at every angle, including 45°.
    width: node.width,
    height: node.height,
    x: parent ? transform[0][2] : 0,
    y: parent ? transform[1][2] : 0,
    rotation: (-Math.atan2(transform[1][0], transform[0][0]) * 180) / Math.PI,
  };
};

/** Bounds of all four corners, including reflections, skew and scale. */
export const getTransformedBounds = (
  width: number,
  height: number,
  transform: Transform,
) => {
  const [[a, c, tx], [b, d, ty]] = transform;
  const x = tx + Math.min(0, width * a) + Math.min(0, height * c);
  const y = ty + Math.min(0, width * b) + Math.min(0, height * d);
  return {
    x,
    y,
    width: Math.abs(width * a) + Math.abs(height * c),
    height: Math.abs(width * b) + Math.abs(height * d),
  };
};

export const getLinearTransform = (node: {
  localTransform?: Transform;
  rotation?: number;
}): Transform => {
  if (node.localTransform) {
    const [[a, c], [b, d]] = node.localTransform;
    return [
      [a, c, 0],
      [b, d, 0],
    ];
  }
  const theta = (-(node.rotation || 0) * Math.PI) / 180;
  return [
    [Math.cos(theta), -Math.sin(theta), 0],
    [Math.sin(theta), Math.cos(theta), 0],
  ];
};

// Matrix coefficients need more precision than dimensions: 0.01 error can
// become several pixels after a large ancestor transform.
export const cssMatrix = (transform: Transform): string => {
  const [[a, c, x], [b, d, y]] = transform;
  return `matrix(${[a, b, c, d, x, y].map((value) => Number(value.toFixed(10))).join(", ")})`;
};

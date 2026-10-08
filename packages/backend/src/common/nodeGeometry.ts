/** Express a page-space transform in the coordinate system of a DOM parent. */
const relativeToParent = (node: Transform, parent: Transform): Transform => {
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
  node: DimensionAndPositionMixin,
  parent?: DimensionAndPositionMixin,
) => {
  // Figma's relativeTransform skips groups and boolean operations. Computing
  // this from absolute transforms also works when those become DOM containers.
  const transform = parent
    ? relativeToParent(node.absoluteTransform, parent.absoluteTransform)
    : node.absoluteTransform;

  return {
    // Original dimensions remain well-defined at every angle, including 45°.
    width: node.width,
    height: node.height,
    x: parent ? transform[0][2] : 0,
    y: parent ? transform[1][2] : 0,
    rotation: (-Math.atan2(transform[1][0], transform[0][0]) * 180) / Math.PI,
  };
};

/** Bounds of a known-size rectangle rotated around its top-left in CSS. */
export const getRotatedBounds = (
  width: number,
  height: number,
  cssRotationDegrees: number,
) => {
  const theta = (cssRotationDegrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const x = Math.min(0, width * cos) + Math.min(0, -height * sin);
  const y = Math.min(0, width * sin) + Math.min(0, height * cos);
  return {
    x,
    y,
    width: Math.abs(width * cos) + Math.abs(height * sin),
    height: Math.abs(width * sin) + Math.abs(height * cos),
  };
};

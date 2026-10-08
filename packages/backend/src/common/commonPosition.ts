export const getCommonPositionValue = (
  node: SceneNode,
): { x: number; y: number } => {
  // Conversion already expresses positions relative to the actual DOM parent.
  // SVG viewport compensation belongs inside its wrapper, not in left/top.
  return {
    x: node.x,
    y: node.y,
  };
};

export const commonIsAbsolutePosition = (node: SceneNode) => {
  if ("layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE") {
    return true;
  }

  if (!node.parent || node.parent === undefined) {
    return false;
  }

  if (
    ("layoutMode" in node.parent && node.parent.layoutMode === "NONE") ||
    !("layoutMode" in node.parent)
  ) {
    return true;
  }

  return false;
};

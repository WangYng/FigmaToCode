export const getCommonPositionValue = (
  node: SceneNode,
): { x: number; y: number } => {
  const anyNode = node as any;
  const parent: any = anyNode.parent;

  if (parent?.absoluteBoundingBox) {
    if (anyNode.svg && anyNode.absoluteBoundingBox) {
      // When embedding vectors, we need to use the absolute position, since it already includes the rotation.
      return {
        x: anyNode.absoluteBoundingBox.x - parent.absoluteBoundingBox.x,
        y: anyNode.absoluteBoundingBox.y - parent.absoluteBoundingBox.y,
      };
    }

    return { x: node.x, y: node.y };
  }

  if (node.parent && node.parent.type === "GROUP") {
    return {
      x: node.x - node.parent.x,
      y: node.y - node.parent.y,
    };
  }

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

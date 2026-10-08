import { nodeSize } from "../../common/nodeWidthHeight";
import { formatCSS } from "../../common/formatCSS";
import { isPreviewGlobal } from "../htmlMain";

export const htmlSizePartial = (
  node: SceneNode,
): { width: string; height: string; constraints: string[] } => {
  if (
    isPreviewGlobal &&
    node.parent === undefined &&
    !("layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE")
  ) {
    return {
      width: formatCSS("width", "100%"),
      height: formatCSS("height", "100%"),
      constraints: [],
    };
  }

  const size = nodeSize(node);
  const nodeParent = node.parent;

  let w = "";
  if (typeof size.width === "number") {
    w = formatCSS("width", size.width);
  } else if (size.width === "fill") {
    if (
      nodeParent &&
      "layoutMode" in nodeParent &&
      nodeParent.layoutMode === "HORIZONTAL"
    ) {
      w = formatCSS("flex", "1 1 0");
    } else {
      if (node.maxWidth) {
        w = formatCSS("width", "100%");
      } else {
        w = formatCSS("align-self", "stretch");
      }
    }
  }

  let h = "";
  if (typeof size.height === "number") {
    h = formatCSS("height", size.height);
  } else if (typeof size.height === "string") {
    if (
      nodeParent &&
      "layoutMode" in nodeParent &&
      nodeParent.layoutMode === "VERTICAL"
    ) {
      h = formatCSS("flex", "1 1 0");
    } else {
      if (node.maxHeight) {
        h = formatCSS("height", "100%");
      } else {
        h = formatCSS("align-self", "stretch");
      }
    }
  }

  // Handle min/max width/height constraints
  const constraints = [];

  if (node.maxWidth !== undefined && node.maxWidth !== null) {
    constraints.push(formatCSS("max-width", node.maxWidth));
  }

  if (node.minWidth !== undefined && node.minWidth !== null) {
    constraints.push(formatCSS("min-width", node.minWidth));
  }

  if (node.maxHeight !== undefined && node.maxHeight !== null) {
    constraints.push(formatCSS("max-height", node.maxHeight));
  }

  if (node.minHeight !== undefined && node.minHeight !== null) {
    constraints.push(formatCSS("min-height", node.minHeight));
  }

  // Return constraints separately instead of appending to width/height
  return {
    width: w,
    height: h,
    constraints: constraints,
  };
};

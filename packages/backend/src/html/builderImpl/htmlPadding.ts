import { commonPadding } from "../../common/commonPadding";
import { formatCSS } from "../../common/formatCSS";

type PaddingNode = InferredAutoLayoutResult &
  Partial<Pick<FrameNode, "width" | "children" | "layoutSizingHorizontal">>;

const hasOversizedButtonPadding = (node: PaddingNode): boolean => {
  const centered =
    node.layoutMode === "HORIZONTAL"
      ? node.primaryAxisAlignItems === "CENTER"
      : node.layoutMode === "VERTICAL" &&
        node.counterAxisAlignItems === "CENTER";
  if (
    !centered ||
    node.layoutWrap === "WRAP" ||
    node.layoutSizingHorizontal !== "FIXED" ||
    !Number.isFinite(node.width) ||
    !(node.width! > 0) ||
    node.paddingLeft !== node.paddingRight ||
    node.paddingLeft + node.paddingRight <= node.width!
  )
    return false;

  const children =
    node.children?.filter((child) => child.visible !== false) ?? [];
  const child = children[0];
  return (
    children.length === 1 &&
    child.type === "TEXT" &&
    child.layoutPositioning !== "ABSOLUTE" &&
    child.textAutoResize === "WIDTH_AND_HEIGHT"
  );
};

export const htmlPadding = (node: PaddingNode): string[] => {
  // Figma can retain padding larger than a fixed button. CSS would enlarge the
  // box or leave no content area. Only normalize this centered, single-label case.
  const resetHorizontal = hasOversizedButtonPadding(node);
  const padding = commonPadding(
    resetHorizontal ? { ...node, paddingLeft: 0, paddingRight: 0 } : node,
  );
  if (padding === null) {
    return [];
  }

  const comp: string[] = resetHorizontal
    ? [formatCSS("padding-left", 0), formatCSS("padding-right", 0)]
    : [];

  if ("all" in padding) {
    if (padding.all !== 0) {
      comp.push(formatCSS("padding", padding.all));
    }
    return comp;
  }

  // horizontal and vertical, as the default AutoLayout
  if ("horizontal" in padding) {
    if (padding.horizontal !== 0) {
      comp.push(formatCSS("padding-left", padding.horizontal));
      comp.push(formatCSS("padding-right", padding.horizontal));
    }
    if (padding.vertical !== 0) {
      comp.push(formatCSS("padding-top", padding.vertical));
      comp.push(formatCSS("padding-bottom", padding.vertical));
    }
    return comp;
  }

  if (padding.top !== 0) {
    comp.push(formatCSS("padding-top", padding.top));
  }
  if (padding.bottom !== 0) {
    comp.push(formatCSS("padding-bottom", padding.bottom));
  }
  if (padding.left !== 0) {
    comp.push(formatCSS("padding-left", padding.left));
  }
  if (padding.right !== 0) {
    comp.push(formatCSS("padding-right", padding.right));
  }
  // todo use REM

  return comp;
};

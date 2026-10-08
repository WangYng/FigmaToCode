import { commonPadding } from "../../common/commonPadding";
import { formatCSS } from "../../common/formatCSS";

export const htmlPadding = (node: InferredAutoLayoutResult): string[] => {
  const padding = commonPadding(node);
  if (padding === null) {
    return [];
  }

  if ("all" in padding) {
    if (padding.all !== 0) {
      return [formatCSS("padding", padding.all)];
    } else {
      return [];
    }
  }

  let comp: string[] = [];

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

import { htmlColor } from "./htmlColor";
import {
  needsNativeShadow,
  shadowEffects,
  ShadowNode,
  usesContourShadow,
} from "../../common/nodeShadow";
import { addWarning } from "../../common/commonConversionWarnings";

export const htmlShadow = (node: ShadowNode): string =>
  shadowEffects(node)
    .map((shadow) => {
      const spread = shadow.spread ? `${shadow.spread}px ` : "";
      const inner = shadow.type === "INNER_SHADOW" ? " inset" : "";
      return `${shadow.offset.x}px ${shadow.offset.y}px ${shadow.radius}px ${spread}${htmlColor(shadow.color, shadow.color.a)}${inner}`;
    })
    .join(", ");

export function htmlShadowStyles(node: ShadowNode): {
  boxShadow: string;
  filter: string;
} {
  if (needsNativeShadow(node)) {
    addWarning(
      `Shadow on ${node.name ?? node.type} requires SVG export to preserve inner/spread, blend, or translucent shadow behavior.`,
    );
    return { boxShadow: "", filter: "" };
  }
  if (!usesContourShadow(node))
    return { boxShadow: htmlShadow(node), filter: "" };
  const shadow = shadowEffects(node)[0];
  if (!shadow || shadow.type !== "DROP_SHADOW")
    return { boxShadow: "", filter: "" };
  // CSS drop-shadow takes Gaussian sigma; box-shadow/Figma use a blur radius.
  return {
    boxShadow: "",
    filter: `drop-shadow(${shadow.offset.x}px ${shadow.offset.y}px ${shadow.radius / 2}px ${htmlColor(shadow.color, shadow.color.a)})`,
  };
}

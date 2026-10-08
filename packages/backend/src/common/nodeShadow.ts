// Structural subset shared by live Figma nodes and the converted JSON tree.
export interface ShadowNode {
  type: string;
  originalType?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  effects?: readonly Effect[];
  fills?:
    | readonly {
        type: string;
        visible?: boolean;
        opacity?: number;
        color?: { r?: number; g?: number; b?: number; a?: number };
      }[]
    | symbol;
  strokes?: readonly { visible?: boolean; opacity?: number }[];
  children?: readonly ShadowNode[];
}

export const shadowEffects = (node: ShadowNode) =>
  (node.effects ?? []).filter(
    (effect): effect is DropShadowEffect | InnerShadowEffect =>
      effect.visible !== false &&
      (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW"),
  );

const visiblePaints = (node: ShadowNode) =>
  Array.isArray(node.fills)
    ? node.fills.filter(
        (fill) => fill.visible !== false && (fill.opacity ?? 1) > 0,
      )
    : [];

export function isVectorArtwork(node: ShadowNode): boolean {
  if (
    [
      "VECTOR",
      "BOOLEAN_OPERATION",
      "RECTANGLE",
      "ELLIPSE",
      "LINE",
      "POLYGON",
      "STAR",
    ].includes(node.type)
  )
    return true;
  if (
    !["GROUP", "FRAME", "COMPONENT", "INSTANCE", "COMPONENT_SET"].includes(
      node.type,
    )
  )
    return false;
  const children =
    node.children?.filter((child) => child.visible !== false) ?? [];
  return children.length > 0 && children.every(isVectorArtwork);
}

export function usesContourShadow(node: ShadowNode): boolean {
  if (node.originalType === "GROUP" || node.type === "GROUP") return true;
  return (
    visiblePaints(node).length === 0 &&
    !(node.strokes ?? []).some(
      (stroke) => stroke.visible !== false && (stroke.opacity ?? 1) > 0,
    ) &&
    !!node.children?.length &&
    isVectorArtwork(node)
  );
}

function hasTranslucentContent(node: ShadowNode): boolean {
  if ((node.opacity ?? 1) < 1) return true;
  if (
    visiblePaints(node).some(
      (fill) =>
        fill.type !== "SOLID" ||
        (fill.opacity ?? 1) < 1 ||
        (fill.color?.a ?? 1) < 1,
    )
  )
    return true;
  return (
    node.children?.some(
      (child) => child.visible !== false && hasTranslucentContent(child),
    ) ?? false
  );
}

/** Cases for which CSS shadows cannot preserve the original effect semantics. */
export function needsNativeShadow(node: ShadowNode): boolean {
  const shadows = shadowEffects(node);
  if (!shadows.length) return false;
  const contour = usesContourShadow(node);
  if (contour && shadows.length > 1) return true; // Chained drop-shadow shadows earlier shadows too.
  return shadows.some(
    (effect) =>
      (effect.blendMode && effect.blendMode !== "NORMAL") ||
      (contour &&
        (effect.type === "INNER_SHADOW" || (effect.spread ?? 0) !== 0)) ||
      (effect.type === "DROP_SHADOW" &&
        hasTranslucentContent(node) &&
        (contour
          ? effect.showShadowBehindNode !== true
          : effect.showShadowBehindNode === true)),
  );
}

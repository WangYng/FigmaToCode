import type { SVGGeometry } from "types";
import { relativeToParent } from "./nodeGeometry";

const rootTag = (svg: string) => {
  const match = /<svg\b[^>]*>/i.exec(svg);
  if (!match) throw new Error("SVG export has no root element");
  return match[0];
};

export function getSVGGeometry(
  svg: string,
  exportBounds: Rect,
  absoluteTransform: Transform,
): SVGGeometry {
  const root = rootTag(svg);
  const attr = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(root)?.[2];
  const viewBox = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = viewBox?.length === 4 ? viewBox[2] : Number(attr("width"));
  const height = viewBox?.length === 4 ? viewBox[3] : Number(attr("height"));
  if (
    ![width, height].every((value) => Number.isFinite(value) && value > 0) ||
    (viewBox && (viewBox.length !== 4 || !viewBox.every(Number.isFinite))) ||
    !Object.values(exportBounds).every(Number.isFinite) ||
    exportBounds.width <= 0 ||
    exportBounds.height <= 0
  ) {
    throw new Error("SVG export has an invalid viewport");
  }
  // Render at the viewBox dimensions to remove rounding/letterboxing introduced
  // by SVG width/height. The SVG renderer handles a nonzero viewBox origin.
  const viewportToPage: Transform = [
    [exportBounds.width / width, 0, exportBounds.x],
    [0, exportBounds.height / height, exportBounds.y],
  ];
  return {
    viewport: { width, height },
    exportBounds,
    viewportToLocal: relativeToParent(viewportToPage, absoluteTransform),
  };
}

/** Normalize only the inline preview; the asset's exported source stays intact. */
export function svgForHTML(svg: string, geometry: SVGGeometry): string {
  const root = rootTag(svg);
  const stripped = root.replace(
    /\s(?:width|height|style)\s*=\s*(["']).*?\1/gi,
    "",
  );
  const style = (/\sstyle\s*=\s*(["'])(.*?)\1/i.exec(root)?.[2] ?? "").replace(
    /"/g,
    "&quot;",
  );
  return svg.replace(
    root,
    stripped.slice(0, -1) +
      ` width="${geometry.viewport.width}" height="${geometry.viewport.height}" style="${style}; display: block; width: ${geometry.viewport.width}px; height: ${geometry.viewport.height}px; max-width: none; max-height: none; overflow: visible">`,
  );
}

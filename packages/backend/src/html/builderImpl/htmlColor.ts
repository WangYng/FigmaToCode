import { numberToFixedString } from "../../common/numToAutoFixed";
import { retrieveTopFill } from "../../common/retrieveFill";
import { cssVariableName } from "../../common/variableToColorName";
import { GradientPaint, Paint } from "../../api_types";

/**
 * Helper to process a color with variable binding if present
 */
export const processColorWithVariable = (fill: {
  color: RGB;
  opacity?: number;
  variableColorName?: string;
}): string => {
  const opacity = fill.opacity ?? 1;

  if (fill.variableColorName) {
    const varName = cssVariableName(fill.variableColorName);
    const fallbackColor = htmlColor(fill.color, opacity);
    return `var(--${varName}, ${fallbackColor})`;
  }
  return htmlColor(fill.color, opacity);
};

/**
 * Extract color, opacity, and bound variable from a fill
 */
const getColorAndVariable = (
  fill: Paint,
): {
  color: RGB;
  opacity: number;
  variableColorName?: string;
} => {
  if (fill.type === "SOLID") {
    return {
      color: fill.color,
      opacity: fill.opacity ?? 1,
      variableColorName: (fill as any).variableColorName,
    };
  } else if (
    (fill.type === "GRADIENT_LINEAR" ||
      fill.type === "GRADIENT_RADIAL" ||
      fill.type === "GRADIENT_ANGULAR" ||
      fill.type === "GRADIENT_DIAMOND") &&
    fill.gradientStops.length > 0
  ) {
    const firstStop = fill.gradientStops[0];
    return {
      color: firstStop.color,
      opacity: fill.opacity ?? 1,
      variableColorName: (firstStop as any).variableColorName,
    };
  }
  return { color: { r: 0, g: 0, b: 0 }, opacity: 0 };
};

/**
 * Convert fills to an HTML color string
 */
export const htmlColorFromFills = (
  fills: ReadonlyArray<Paint> | undefined,
): string => {
  const fill = retrieveTopFill(fills);
  if (fill) {
    const colorInfo = getColorAndVariable(fill);
    return processColorWithVariable(colorInfo);
  }
  return "";
};

/**
 * Convert fills to an HTML color string
 */
export const htmlColorFromFill = (fill: Paint): string => {
  return processColorWithVariable(fill as any);
};

/**
 * Convert RGB color to CSS color string
 */
export const htmlColor = (color: RGB, alpha: number = 1): string => {
  if (color.r === 1 && color.g === 1 && color.b === 1 && alpha === 1) {
    return "white";
  }
  if (color.r === 0 && color.g === 0 && color.b === 0 && alpha === 1) {
    return "black";
  }
  if (alpha === 1) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const toHex = (num: number): string => num.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }
  const r = numberToFixedString(color.r * 255);
  const g = numberToFixedString(color.g * 255);
  const b = numberToFixedString(color.b * 255);
  const a = numberToFixedString(alpha);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Process a single gradient stop
 */
const processGradientStop = (
  stop: ColorStop,
  fillOpacity: number = 1,
  positionMultiplier: number = 100,
  unit: string = "%",
): string => {
  const fillInfo = {
    color: stop.color,
    opacity: stop.color.a * fillOpacity,
    boundVariables: stop.boundVariables,
    variableColorName: (stop as any).variableColorName,
  };

  const color = processColorWithVariable(fillInfo);
  const position = `${Number((stop.position * positionMultiplier).toFixed(6))}${unit}`;
  return `${color} ${position}`;
};

/**
 * Process all gradient stops for a gradient
 */
const processGradientStops = (
  stops: ReadonlyArray<ColorStop>,
  fillOpacity: number = 1,
  positionMultiplier: number = 100,
  unit: string = "%",
): string => {
  return stops
    .map((stop) =>
      processGradientStop(stop, fillOpacity, positionMultiplier, unit),
    )
    .join(", ");
};

/**
 * Determine the appropriate gradient function based on fill type
 */
export const htmlGradientFromFills = (
  fill: Paint,
  size: { width: number; height: number } = { width: 1, height: 1 },
): string => {
  if (!fill || fill.visible === false) return "";
  switch (fill.type) {
    case "GRADIENT_LINEAR":
      return htmlLinearGradient(fill, size);
    case "GRADIENT_ANGULAR":
      return htmlAngularGradient(fill);
    case "GRADIENT_RADIAL":
      return htmlRadialGradient(fill);
    case "GRADIENT_DIAMOND":
      return htmlDiamondGradient(fill);
    default:
      return "";
  }
};

/**
 * Generate CSS linear gradient
 */
export const htmlLinearGradient = (
  fill: GradientPaint,
  size: { width: number; height: number } = { width: 1, height: 1 },
) => {
  if (fill.visible === false || !fill.gradientStops.length) return "";
  const [start, end] = fill.gradientHandlePositions;
  const width = size.width > 0 ? size.width : 1;
  const height = size.height > 0 ? size.height : 1;
  const dx = (end.x - start.x) * width;
  const dy = (end.y - start.y) * height;
  const length = Math.hypot(dx, dy);
  if (length < 1e-12) {
    const stop = fill.gradientStops[fill.gradientStops.length - 1];
    return `linear-gradient(0deg, ${processGradientStop({ ...stop, position: 0 }, fill.opacity ?? 1)}, ${processGradientStop({ ...stop, position: 1 }, fill.opacity ?? 1)})`;
  }
  const ux = dx / length;
  const uy = dy / length;
  // CSS centers its gradient line on the box. Project the Figma origin and
  // gradient length onto that line, retaining stops outside the 0–100% range.
  const cssLength = Math.abs(width * ux) + Math.abs(height * uy);
  const offset =
    (start.x - 0.5) * width * ux +
    (start.y - 0.5) * height * uy +
    cssLength / 2;
  const cssAngle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
  const mappedFill = fill.gradientStops
    .map((stop) =>
      processGradientStop(
        { ...stop, position: (offset + stop.position * length) / cssLength },
        fill.opacity ?? 1,
      ),
    )
    .join(", ");
  return `linear-gradient(${Number(cssAngle.toFixed(6))}deg, ${mappedFill})`;
};

/**
 * Generate CSS radial gradient
 */
export const htmlRadialGradient = (fill: GradientPaint) => {
  const [center, h1, h2] = fill.gradientHandlePositions;
  const cx = center.x * 100; // Center X as percentage
  const cy = center.y * 100; // Center Y as percentage
  // Calculate horizontal radius (distance from center to h1)
  const rx = Math.sqrt((h1.x - center.x) ** 2 + (h1.y - center.y) ** 2) * 100;
  // Calculate vertical radius (distance from center to h2)
  const ry = Math.sqrt((h2.x - center.x) ** 2 + (h2.y - center.y) ** 2) * 100;
  const mappedStops = processGradientStops(
    fill.gradientStops,
    fill.opacity ?? 1,
  );
  return `radial-gradient(ellipse ${rx.toFixed(2)}% ${ry.toFixed(2)}% at ${cx.toFixed(2)}% ${cy.toFixed(2)}%, ${mappedStops})`;
};

/**
 * Generate CSS conic (angular) gradient
 */
export const htmlAngularGradient = (fill: GradientPaint) => {
  const [center, _, startDirection] = fill.gradientHandlePositions;
  const cx = center.x * 100; // Center X as percentage
  const cy = center.y * 100; // Center Y as percentage
  // Calculate the starting angle
  const dx = startDirection.x - center.x;
  const dy = startDirection.y - center.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI); // Convert to degrees
  angle = (angle + 360) % 360; // Normalize to 0-360 degrees
  const mappedFill = processGradientStops(
    fill.gradientStops,
    fill.opacity ?? 1,
    360,
    "deg",
  );
  return `conic-gradient(from ${angle.toFixed(0)}deg at ${cx.toFixed(2)}% ${cy.toFixed(2)}%, ${mappedFill})`;
};

/**
 * Generate CSS diamond gradient (approximation using four linear gradients)
 */
export const htmlDiamondGradient = (fill: GradientPaint) => {
  const stops = processGradientStops(
    fill.gradientStops,
    fill.opacity ?? 1,
    50,
    "%",
  );
  const gradientConfigs = [
    { direction: "to bottom right", position: "bottom right" },
    { direction: "to bottom left", position: "bottom left" },
    { direction: "to top left", position: "top left" },
    { direction: "to top right", position: "top right" },
  ];
  return gradientConfigs
    .map(
      ({ direction, position }) =>
        `linear-gradient(${direction}, ${stops}) ${position} / 50% 50% no-repeat`,
    )
    .join(", ");
};

/**
 * Build CSS background value from an array of paints
 */
export const buildBackgroundValues = (
  paintArray: ReadonlyArray<Paint> | PluginAPI["mixed"],
  size?: { width: number; height: number },
): string => {
  const paints = getBackgroundPaints(paintArray);

  // If only one fill, use plain color or gradient
  if (paints.length === 1) {
    const paint = paints[0];
    if (paint.type === "SOLID") {
      return htmlColorFromFills(paints);
    } else if (
      paint.type === "GRADIENT_LINEAR" ||
      paint.type === "GRADIENT_RADIAL" ||
      paint.type === "GRADIENT_ANGULAR" ||
      paint.type === "GRADIENT_DIAMOND"
    ) {
      return htmlGradientFromFills(paint, size);
    }
    return "";
  }

  // For multiple fills, reverse to match CSS layering (first is top-most)
  const styles = [...paints].reverse().map((paint) => {
    if (paint.type === "SOLID") {
      // Convert solid colors to gradients for proper layering
      const color = htmlColorFromFills([paint]);
      return `linear-gradient(0deg, ${color} 0%, ${color} 100%)`;
    } else if (
      paint.type === "GRADIENT_LINEAR" ||
      paint.type === "GRADIENT_RADIAL" ||
      paint.type === "GRADIENT_ANGULAR" ||
      paint.type === "GRADIENT_DIAMOND"
    ) {
      return htmlGradientFromFills(paint, size);
    }
    return ""; // Handle other paint types safely
  });

  return styles.filter((value) => value !== "").join(", ");
};

/** The same visible, supported layers drive background and blend-mode order. */
export const getBackgroundPaints = (
  paints: ReadonlyArray<Paint> | PluginAPI["mixed"],
): Paint[] =>
  Array.isArray(paints)
    ? paints.filter(
        (paint) =>
          paint.visible !== false &&
          (paint.type === "SOLID" ||
            [
              "GRADIENT_LINEAR",
              "GRADIENT_RADIAL",
              "GRADIENT_ANGULAR",
              "GRADIENT_DIAMOND",
            ].includes(paint.type)),
      )
    : [];

import { numberToFixedString } from "./numToAutoFixed";

export const formatCSS = (property: string, value: number | string): string =>
  `${property}: ${typeof value === "number" ? `${numberToFixedString(value)}px` : value}`;

export const formatCSSArray = (
  styles: Record<string, string | number>,
): string[] =>
  Object.entries(styles)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => formatCSS(key, value));

export const formatCSSDeclarations = (
  styles: Record<string, string | number | null>,
): string =>
  Object.entries(styles)
    .filter(([, value]) => value)
    .map(([key, value]) => formatCSS(key, value!))
    .join("; ");

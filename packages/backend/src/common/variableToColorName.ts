export const cssVariableName = (name: string): string => {
  const sanitized = name
    .trim()
    .replace(/[^\p{L}\p{N}_-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) return "figma-variable";

  return /^[\p{L}_]/u.test(sanitized) || sanitized.startsWith("--")
    ? sanitized
    : `figma-${sanitized}`;
};

/**
 * Convert a Figma variable id to a stable CSS-friendly name.
 *
 * This was previously implemented in the Tailwind conversion tables but is also
 * used by the JSON pipeline (color variable preprocessing), even in HTML-only mode.
 */
export const variableToColorName = async (id: string) => {
  const variableName = (await figma.variables.getVariableByIdAsync(id))?.name;
  return cssVariableName(variableName || id.toLowerCase().replaceAll(":", "-"));
};

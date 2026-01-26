/**
 * Convert a Figma variable id to a stable CSS-friendly name.
 *
 * This was previously implemented in the Tailwind conversion tables but is also
 * used by the JSON pipeline (color variable preprocessing), even in HTML-only mode.
 */
export const variableToColorName = async (id: string) => {
  return (
    (await figma.variables.getVariableByIdAsync(id))?.name
      .replaceAll("/", "-")
      .replaceAll(" ", "-") || id.toLowerCase().replaceAll(":", "-")
  );
};


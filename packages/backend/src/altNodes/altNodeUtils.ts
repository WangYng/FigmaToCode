import { exportAsyncProxy } from "../common/exportAsyncProxy";
import { addWarning } from "../common/commonConversionWarnings";
import { getSVGGeometry } from "../common/svgGeometry";

export const renderAndAttachSVG = async (node: any) => {
  if (node.canBeFlattened) {
    if (node.svg && node.svgGeometry) {
      return node;
    }

    try {
      const svg = (await exportAsyncProxy<string>(node, {
        format: "SVG_STRING",
        contentsOnly: true,
        useAbsoluteBounds: true,
      })) as string;

      if (!node.absoluteBoundingBox || !node.absoluteTransform) {
        throw new Error("Missing SVG export geometry");
      }
      const svgGeometry = getSVGGeometry(
        svg,
        node.absoluteBoundingBox,
        node.absoluteTransform,
      );

      // Process the SVG to replace colors with variable references
      if (node.colorVariableMappings && node.colorVariableMappings.size > 0) {
        let processedSvg = svg;

        // Replace fill="COLOR" or stroke="COLOR" patterns
        const colorAttributeRegex = /(fill|stroke)="([^"]*)"/g;

        processedSvg = processedSvg.replace(
          colorAttributeRegex,
          (match, attribute, colorValue) => {
            // Clean up the color value and normalize it
            const normalizedColor = colorValue.toLowerCase().trim();

            // Look up the color directly in our mappings
            const mapping = node.colorVariableMappings.get(normalizedColor);
            if (mapping) {
              // If we have a variable reference, use it with fallback to original
              return `${attribute}="var(--${mapping.variableName}, ${colorValue})"`;
            }

            // Otherwise keep the original color
            return match;
          },
        );

        // Also handle style attributes with fill: or stroke: properties
        const styleRegex =
          /style="([^"]*)(?:(fill|stroke):\s*([^;"]*))(;|\s|")([^"]*)"/g;

        processedSvg = processedSvg.replace(
          styleRegex,
          (match, prefix, property, colorValue, separator, suffix) => {
            // Clean up any extra spaces from the color value
            const normalizedColor = colorValue.toLowerCase().trim();

            // Look up the color directly in our mappings
            const mapping = node.colorVariableMappings.get(normalizedColor);
            if (mapping) {
              // Replace just the color value with the variable and fallback
              return `style="${prefix}${property}: var(--${mapping.variableName}, ${colorValue})${separator}${suffix}"`;
            }

            return match;
          },
        );

        node.svg = processedSvg;
      } else {
        node.svg = svg;
      }
      node.svgGeometry = svgGeometry;
    } catch (error) {
      addWarning(`Failed rendering SVG for ${node.name}`);
      console.error(`Error rendering SVG for ${node.type}:${node.id}`);
      console.error(error);
    }
  }
  return node;
};

import { addWarning } from "../common/commonConversionWarnings";
import { PluginSettings } from "types";
import { variableToColorName } from "../tailwind/conversionTables";
import { HasGeometryTrait, Node, Paint } from "../api_types";
import { calculateRectangleFromBoundingBox } from "../common/commonPosition";
import { isLikelyIcon } from "./iconDetection";
import { AltNode } from "../alt_api_types";

const hasSvgExportSettings = (node: any): boolean => {
  const settingsToCheck: ReadonlyArray<any> = node?.exportSettings || [];
  return settingsToCheck.some((setting) => setting?.format === "SVG");
};

const isWithinMaxSize = (node: any, maxSize = 64): boolean => {
  const w = typeof node?.width === "number" ? node.width : undefined;
  const h = typeof node?.height === "number" ? node.height : undefined;
  if (!w || !h) return false;
  return w > 0 && h > 0 && w <= maxSize && h <= maxSize;
};

// Conservative "this is basically an SVG asset" check for the JSON pipeline.
// We use this ONLY when embedVectors is disabled, to still embed small icon-like vector groups
// without flattening arbitrary layout frames.
const isPureVectorAsset = (node: any): boolean => {
  if (!node || node.visible === false) return false;

  // Allowed leaf primitives that export cleanly to SVG.
  // Allowed containers that may wrap vector leaves.
  const isAllowedLeaf =
    node.type === "VECTOR" ||
    node.type === "BOOLEAN_OPERATION" ||
    node.type === "RECTANGLE" ||
    node.type === "ELLIPSE" ||
    node.type === "STAR" ||
    node.type === "POLYGON" ||
    node.type === "LINE";
  if (isAllowedLeaf) return true;

  const isAllowedContainer =
    node.type === "GROUP" ||
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE";
  if (!isAllowedContainer) return false;

  const children: any[] = Array.isArray(node.children) ? node.children : [];
  const visibleChildren = children.filter((c) => c?.visible !== false);
  if (visibleChildren.length === 0) return false;

  return visibleChildren.every(isPureVectorAsset);
};

// Performance tracking counters
export let getNodeByIdAsyncTime = 0;
export let getNodeByIdAsyncCalls = 0;
export let getStyledTextSegmentsTime = 0;
export let getStyledTextSegmentsCalls = 0;
export let processColorVariablesTime = 0;
export let processColorVariablesCalls = 0;
export let totalNodesProcessed = 0;

export const resetPerformanceCounters = () => {
  getNodeByIdAsyncTime = 0;
  getNodeByIdAsyncCalls = 0;
  getStyledTextSegmentsTime = 0;
  getStyledTextSegmentsCalls = 0;
  processColorVariablesTime = 0;
  processColorVariablesCalls = 0;
  totalNodesProcessed = 0;
  variableCache.clear();
};

// Keep track of node names for sequential numbering
const nodeNameCounters: Map<string, number> = new Map();

const variableCache = new Map<string, string>();

/**
 * Maps variable IDs to color names and caches the result
 */
const memoizedVariableToColorName = async (
  variableId: string,
): Promise<string> => {
  if (!variableCache.has(variableId)) {
    const colorName = (await variableToColorName(variableId)).replaceAll(
      ",",
      "",
    );
    variableCache.set(variableId, colorName);
    return colorName;
  }
  return variableCache.get(variableId)!;
};

/**
 * Maps a color hex value to its variable name using node-specific color mappings
 */
export const getVariableNameFromColor = (
  hexColor: string,
  colorMappings?: Map<string, { variableId: string; variableName: string }>,
): string | undefined => {
  if (!colorMappings) return undefined;

  const normalizedColor = hexColor.toLowerCase();
  const mapping = colorMappings.get(normalizedColor);

  if (mapping) {
    return mapping.variableName;
  }

  return undefined;
};

/**
 * Collects all color variables used in a node and its descendants
 */
const collectNodeColorVariables = async (
  node: any,
): Promise<Map<string, { variableId: string; variableName: string }>> => {
  const colorMappings = new Map<
    string,
    { variableId: string; variableName: string }
  >();

  // Helper function to add a mapping from a paint object
  const addMappingFromPaint = (paint: any) => {
    // Ensure we have a solid paint, a resolved variable name, and color data
    if (
      paint.type === "SOLID" &&
      paint.variableColorName &&
      paint.color &&
      paint.boundVariables?.color
    ) {
      // Prefer the actual variable name from the bound variable if available
      const variableName =
        paint.boundVariables.color.name || paint.variableColorName;

      if (variableName) {
        // Sanitize the variable name for CSS
        const sanitizedVarName = variableName.replace(/[^a-zA-Z0-9_-]/g, "-");

        const colorInfo = {
          variableId: paint.boundVariables.color.id,
          variableName: sanitizedVarName,
        };

        // Create hex representation of the color
        const r = Math.round(paint.color.r * 255);
        const g = Math.round(paint.color.g * 255);
        const b = Math.round(paint.color.b * 255);

        // Standard hex format (lowercase for consistent mapping)
        const hexColor =
          `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toLowerCase();
        colorMappings.set(hexColor, colorInfo);

        // Add common named colors that the SVG might use
        // When htmlColor() in builderImpl/htmlColor.ts converts colors to strings,
        // it returns "white" for RGB(1,1,1) and "black" for RGB(0,0,0)
        if (r === 255 && g === 255 && b === 255) {
          colorMappings.set("white", colorInfo); // Classic CSS color name
          colorMappings.set("rgb(255,255,255)", colorInfo); // RGB format
        } else if (r === 0 && g === 0 && b === 0) {
          colorMappings.set("black", colorInfo);
          colorMappings.set("rgb(0,0,0)", colorInfo);
        }
        // Add other frequently used named colors if needed
      }
    }
  };

  // Process fills
  if (node.fills && Array.isArray(node.fills)) {
    node.fills.forEach(addMappingFromPaint);
  }

  // Process strokes
  if (node.strokes && Array.isArray(node.strokes)) {
    node.strokes.forEach(addMappingFromPaint);
  }

  // Process children recursively
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      const childMappings = await collectNodeColorVariables(child);
      // Merge child mappings with this node's mappings
      childMappings.forEach((value, key) => {
        colorMappings.set(key, value);
      });
    }
  }

  return colorMappings;
};

/**
 * Process color variables in a paint style and add pre-computed variable names
 * @param paint The paint style to process (fill or stroke)
 */
export const processColorVariables = async (paint: Paint) => {
  const start = Date.now();
  processColorVariablesCalls++;

  if (
    paint.type === "GRADIENT_ANGULAR" ||
    paint.type === "GRADIENT_DIAMOND" ||
    paint.type === "GRADIENT_LINEAR" ||
    paint.type === "GRADIENT_RADIAL"
  ) {
    // Filter stops with bound variables first to avoid unnecessary work
    const stopsWithVariables = paint.gradientStops.filter(
      (stop) => stop.boundVariables?.color,
    );

    // Process all gradient stops with variables in parallel
    if (stopsWithVariables.length > 0) {
      await Promise.all(
        stopsWithVariables.map(async (stop) => {
          (stop as any).variableColorName = await memoizedVariableToColorName(
            stop.boundVariables!.color!.id,
          );
        }),
      );
    }
  } else if (paint.type === "SOLID" && paint.boundVariables?.color) {
    // Pre-compute and store the variable name
    (paint as any).variableColorName = await memoizedVariableToColorName(
      paint.boundVariables.color.id,
    );
  }

  processColorVariablesTime += Date.now() - start;
};

const processEffectVariables = async (
  paint: DropShadowEffect | InnerShadowEffect,
) => {
  const start = Date.now();
  processColorVariablesCalls++;

  if (paint.boundVariables?.color) {
    // Pre-compute and store the variable name
    (paint as any).variableColorName = await memoizedVariableToColorName(
      paint.boundVariables.color.id,
    );
  }

  processColorVariablesTime += Date.now() - start;
};

const getColorVariables = async (
  node: HasGeometryTrait,
  settings: PluginSettings,
) => {
  // This tries to be as fast as it can, using Promise.all so it can parallelize calls.
  if (settings.useColorVariables) {
    if (node.fills && Array.isArray(node.fills)) {
      await Promise.all(
        node.fills.map((fill: Paint) => processColorVariables(fill)),
      );
    }
    if (node.strokes && Array.isArray(node.strokes)) {
      await Promise.all(
        node.strokes.map((stroke: Paint) => processColorVariables(stroke)),
      );
    }
    if ("effects" in node && node.effects && Array.isArray(node.effects)) {
      await Promise.all(
        node.effects
          .filter(
            (effect: Effect) =>
              effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW",
          )
          .map((effect: DropShadowEffect | InnerShadowEffect) =>
            processEffectVariables(effect),
          ),
      );
    }
  }
};

function adjustChildrenOrder(node: any) {
  if (!node.itemReverseZIndex || !node.children || node.layoutMode === "NONE") {
    return;
  }

  const children = node.children;
  const absoluteChildren = [];
  const fixedChildren = [];

  // Single pass to separate absolute and fixed children
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (child.layoutPositioning === "ABSOLUTE") {
      absoluteChildren.push(child);
    } else {
      fixedChildren.unshift(child); // Add to beginning to maintain original order
    }
  }

  // Combine the arrays (reversed absolute children + original order fixed children)
  node.children = [...absoluteChildren, ...fixedChildren];
}

/**
 * Recursively process both JSON node and Figma node to update with data not available in JSON
 * This now includes the functionality from convertNodeToAltNode
 * @param jsonNode The JSON node to process
 * @param figmaNode The corresponding Figma node
 * @param settings Plugin settings
 * @param parentNode Optional parent node reference to set
 * @param parentCumulativeRotation Optional parent cumulative rotation to inherit
 * @returns Potentially modified jsonNode, array of nodes (for inlined groups), or null
 */
const processNodePair = async (
  jsonNode: AltNode,
  figmaNode: SceneNode,
  settings: PluginSettings,
  parentNode?: AltNode,
  parentCumulativeRotation: number = 0,
): Promise<Node | Node[] | null> => {
  totalNodesProcessed++;
  if (totalNodesProcessed > 500) {
    addWarning(
      "Too many nodes selected (over 500). Please select a smaller part of your design to avoid memory issues.",
    );
    return null;
  }

  if (!jsonNode.id) return null;
  if (jsonNode.visible === false) return null;

  // Handle node type-specific conversions (from convertNodeToAltNode)
  const nodeType = jsonNode.type;

  // Store the cumulative rotation (parent's cumulative + node's own)
  if (parentNode) {
    // Only add cumulative when there is a parent. This is useful for the GROUP -> FRAME transformation, where
    // we want to move the rotation of the GROUP to children, but want to se FRAME to 0.
    jsonNode.cumulativeRotation = parentCumulativeRotation;
  }

  // Handle empty frames and convert to rectangles
  if (
    (nodeType === "FRAME" ||
      nodeType === "INSTANCE" ||
      nodeType === "COMPONENT" ||
      nodeType === "COMPONENT_SET") &&
    (!jsonNode.children || jsonNode.children.length === 0)
  ) {
    // Convert to rectangle
    jsonNode.type = "RECTANGLE";
    return processNodePair(
      jsonNode,
      figmaNode,
      settings,
      parentNode,
      parentCumulativeRotation,
    );
  }

  if ("rotation" in jsonNode && jsonNode.rotation) {
    jsonNode.rotation = -jsonNode.rotation * (180 / Math.PI);
  }

  // Convert GROUP to FRAME to preserve container structure
  if (nodeType === "GROUP") {
    (jsonNode as any).type = "FRAME";
    // GROUP doesn't have layoutMode, set it explicitly
    jsonNode.layoutMode = "NONE";
    // Mark as relative positioning container since GROUP children use absolute positions
    jsonNode.isRelative = true;
  }

  // Return null for unsupported nodes
  if (nodeType === "SLICE") {
    return null;
  }

  // Set parent reference if parent is provided
  if (parentNode) {
    (jsonNode as any).parent = parentNode;
  }

  // Ensure node has a unique name with simple numbering
  const cleanName = jsonNode.name.trim();

  // Track names with simple counter
  const count = nodeNameCounters.get(cleanName) || 0;
  nodeNameCounters.set(cleanName, count + 1);

  // For first occurrence, use original name; for duplicates, add sequential suffix
  jsonNode.uniqueName =
    count === 0
      ? cleanName
      : `${cleanName}_${count.toString().padStart(2, "0")}`;

  // Handle text-specific properties
  if (figmaNode.type === "TEXT") {
    const getSegmentsStart = Date.now();
    getStyledTextSegmentsCalls++;
    let styledTextSegments = figmaNode.getStyledTextSegments([
      "fontName",
      "fills",
      "fontSize",
      "fontWeight",
      "hyperlink",
      "indentation",
      "letterSpacing",
      "lineHeight",
      "listOptions",
      "textCase",
      "textDecoration",
      "textStyleId",
      "fillStyleId",
      "openTypeFeatures",
    ]);
    getStyledTextSegmentsTime += Date.now() - getSegmentsStart;

    // Assign unique IDs to each segment
    if (styledTextSegments.length > 0) {
      const baseSegmentName = (jsonNode.uniqueName || jsonNode.name)
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .toLowerCase();

      // Add a uniqueId to each segment
      styledTextSegments = await Promise.all(
        styledTextSegments.map(async (segment, index) => {
          const mutableSegment: any = Object.assign({}, segment);

          if (settings.useColorVariables && segment.fills) {
            mutableSegment.fills = await Promise.all(
              segment.fills.map(async (d) => {
                if (
                  d.blendMode !== "PASS_THROUGH" &&
                  d.blendMode !== "NORMAL"
                ) {
                  addWarning("BlendMode is not supported in Text colors");
                }
                const fill = { ...d } as Paint;
                await processColorVariables(fill);
                return fill;
              }),
            );
          }

          // For single segments, don't add index suffix
          if (styledTextSegments.length === 1) {
            (mutableSegment as any).uniqueId = `${baseSegmentName}_span`;
          } else {
            // For multiple segments, add index suffix
            (mutableSegment as any).uniqueId =
              `${baseSegmentName}_span_${(index + 1).toString().padStart(2, "0")}`;
          }
          return mutableSegment;
        }),
      );

      jsonNode.styledTextSegments = styledTextSegments;
    }

    // Inline text style.
    Object.assign(jsonNode, jsonNode.style);
    if (!jsonNode.textAutoResize) {
      jsonNode.textAutoResize = "NONE";
    }
  }

  // Always copy size and position
  if ("absoluteBoundingBox" in jsonNode && jsonNode.absoluteBoundingBox) {
    if (jsonNode.parent) {
      // Extract width and height from bounding box and rotation. This is necessary because Figma JSON API doesn't have width and height.
      const rect = calculateRectangleFromBoundingBox(
        {
          width: jsonNode.absoluteBoundingBox.width,
          height: jsonNode.absoluteBoundingBox.height,
          x:
            jsonNode.absoluteBoundingBox.x -
            (jsonNode.parent?.absoluteBoundingBox.x || 0),
          y:
            jsonNode.absoluteBoundingBox.y -
            (jsonNode.parent?.absoluteBoundingBox.y || 0),
        },
        -((jsonNode.rotation || 0) + (jsonNode.cumulativeRotation || 0)),
      );

      jsonNode.width = rect.width;
      jsonNode.height = rect.height;
      jsonNode.x = rect.left;
      jsonNode.y = rect.top;
    } else {
      jsonNode.width = jsonNode.absoluteBoundingBox.width;
      jsonNode.height = jsonNode.absoluteBoundingBox.height;
      jsonNode.x = 0;
      jsonNode.y = 0;
    }
  }

  // Add canBeFlattened property
  const svgExportExplicitlyEnabled = hasSvgExportSettings(jsonNode);
  if ((settings.embedVectors || svgExportExplicitlyEnabled) && !parentNode?.canBeFlattened) {
    // If embedVectors is enabled, we use the full icon heuristic.
    // If embedVectors is disabled, we ONLY flatten nodes that explicitly opted into SVG export.
    const canFlatten =
      settings.embedVectors
        ? isLikelyIcon(
            jsonNode as any,
            false,
            settings.embedVectorsMaxSize ?? 64,
          )
        : svgExportExplicitlyEnabled;
    (jsonNode as any).canBeFlattened = canFlatten;

    // If this node will be flattened to SVG, collect its color variables
    if (canFlatten && settings.useColorVariables) {
      // Schedule color mapping collection after variable processing
      (jsonNode as any)._collectColorMappings = true;
    }
  } else {
    // When embedVectors is disabled, we still want small, pure-vector icon groups
    // to embed as a single SVG (common for icon packs), even if the designer didn't
    // manually set export settings. This avoids degrading icons into outlined rectangles.
    if (!settings.embedVectors && !parentNode?.canBeFlattened) {
      const maxSize = settings.embedVectorsMaxSize ?? 64;
      const canFlatten =
        svgExportExplicitlyEnabled ||
        (isWithinMaxSize(jsonNode, maxSize) && isPureVectorAsset(jsonNode));
      (jsonNode as any).canBeFlattened = canFlatten;
      if (canFlatten && settings.useColorVariables) {
        (jsonNode as any)._collectColorMappings = true;
      }
    } else {
      (jsonNode as any).canBeFlattened = false;
    }
  }

  if (
    "individualStrokeWeights" in jsonNode &&
    jsonNode.individualStrokeWeights
  ) {
    (jsonNode as any).strokeTopWeight = jsonNode.individualStrokeWeights.top;
    (jsonNode as any).strokeBottomWeight =
      jsonNode.individualStrokeWeights.bottom;
    (jsonNode as any).strokeLeftWeight = jsonNode.individualStrokeWeights.left;
    (jsonNode as any).strokeRightWeight =
      jsonNode.individualStrokeWeights.right;
  }

  await getColorVariables(jsonNode, settings);

  // Some places check if paddingLeft exists. This makes sure they all exist, even if 0.
  if ("layoutMode" in jsonNode && jsonNode.layoutMode) {
    if (jsonNode.paddingLeft === undefined) {
      jsonNode.paddingLeft = 0;
    }
    if (jsonNode.paddingRight === undefined) {
      jsonNode.paddingRight = 0;
    }
    if (jsonNode.paddingTop === undefined) {
      jsonNode.paddingTop = 0;
    }
    if (jsonNode.paddingBottom === undefined) {
      jsonNode.paddingBottom = 0;
    }
  }

  // Set default layout properties if missing
  if (!jsonNode.layoutMode) jsonNode.layoutMode = "NONE";
  if (!jsonNode.layoutGrow) jsonNode.layoutGrow = 0;
  if (!jsonNode.layoutSizingHorizontal)
    jsonNode.layoutSizingHorizontal = "FIXED";
  if (!jsonNode.layoutSizingVertical) jsonNode.layoutSizingVertical = "FIXED";
  if (!jsonNode.primaryAxisAlignItems) {
    jsonNode.primaryAxisAlignItems = "MIN";
  }
  if (!jsonNode.counterAxisAlignItems) {
    jsonNode.counterAxisAlignItems = "MIN";
  }

  // If layout sizing is HUG but there are no children, set it to FIXED
  const hasChildren =
    "children" in jsonNode &&
    jsonNode.children &&
    Array.isArray(jsonNode.children) &&
    jsonNode.children.length > 0;

  if (jsonNode.layoutSizingHorizontal === "HUG" && !hasChildren) {
    jsonNode.layoutSizingHorizontal = "FIXED";
  }
  if (jsonNode.layoutSizingVertical === "HUG" && !hasChildren) {
    jsonNode.layoutSizingVertical = "FIXED";
  }

  // Process children recursively if both have children
  if (
    "children" in jsonNode &&
    jsonNode.children &&
    Array.isArray(jsonNode.children) &&
    "children" in figmaNode
  ) {
    // Get only visible JSON children
    const visibleJsonChildren = jsonNode.children.filter(
      (child) => child.visible !== false,
    ) as AltNode[];

    // Create a map of figma children by ID for easier matching
    const figmaChildrenById = new Map();
    figmaNode.children.forEach((child) => {
      figmaChildrenById.set(child.id, child);
    });

    const cumulative =
      parentCumulativeRotation +
      (jsonNode.type === "GROUP" ? jsonNode.rotation || 0 : 0);

    // Process children and handle potential null returns
    const processedChildren = [];

    // Process all visible JSON children that have matching Figma nodes
    for (const child of visibleJsonChildren) {
      const figmaChild = figmaChildrenById.get(child.id);
      if (!figmaChild) continue; // Skip if no matching Figma node found

      const processedChild = await processNodePair(
        child,
        figmaChild,
        settings,
        jsonNode,
        cumulative,
      );

      if (processedChild !== null) {
        if (Array.isArray(processedChild)) {
          processedChildren.push(...processedChild);
        } else {
          processedChildren.push(processedChild);
        }
      }
    }

    // Replace children array with processed children
    jsonNode.children = processedChildren;

    if (
      jsonNode.layoutMode === "NONE" ||
      jsonNode.children.some(
        (d: any) =>
          "layoutPositioning" in d && d.layoutPositioning === "ABSOLUTE",
      )
    ) {
      jsonNode.isRelative = true;
    }

    adjustChildrenOrder(jsonNode);
  }

  // Collect color variables for SVG nodes after all processing is done
  if ((jsonNode as any)._collectColorMappings) {
    (jsonNode as any).colorVariableMappings =
      await collectNodeColorVariables(jsonNode);
    delete (jsonNode as any)._collectColorMappings;
  }

  return jsonNode;
};

/**
 * Helper to count nodes in a selection efficiently without full traversal if limit is reached
 */
const getCount = (node: SceneNode, limit: number): number => {
  let count = 1;
  if ("children" in node) {
    for (const child of node.children) {
      count += getCount(child, limit);
      if (count > limit) return count;
    }
  }
  return count;
};

/**
 * Convert Figma nodes to JSON format with parent references added
 * @param nodes The Figma nodes to convert to JSON
 * @param settings Plugin settings
 * @returns JSON representation of the nodes with parent references
 */
export const nodesToJSON = async (
  nodes: ReadonlyArray<SceneNode>,
  settings: PluginSettings,
): Promise<Node[]> => {
  // Reset name counters for each conversion
  nodeNameCounters.clear();
  variableCache.clear();
  totalNodesProcessed = 0;

  // Pre-check for total node count to avoid memory issues during exportAsync
  let totalCount = 0;
  const limit = 500;
  for (const node of nodes) {
    totalCount += getCount(node, limit);
    if (totalCount > limit) {
      addWarning(
        `Too many nodes selected (over ${limit}). Please select a smaller part of your design to avoid memory issues.`,
      );
      return [];
    }
  }

  const exportJsonStart = Date.now();
  const result: Node[] = [];

  // Process nodes sequentially to minimize memory footprint
  for (const node of nodes) {
    try {
      // Export node to JSON
      const exportStart = Date.now();
      const nodeDoc = (
        (await node.exportAsync({
          format: "JSON_REST_V1",
        })) as any
      ).document;

      let nodeCumulativeRotation = 0;

      // Wire GROUPs into FRAME.
      if (node.type === "GROUP") {
        nodeDoc.type = "FRAME";

        // Fix rotation for children.
        if ("rotation" in nodeDoc && nodeDoc.rotation) {
          nodeCumulativeRotation = -nodeDoc.rotation * (180 / Math.PI);
          nodeDoc.rotation = 0;
        }
      }

      console.log(
        `[benchmark][inside nodesToJSON] Single node export: ${Date.now() - exportStart}ms`,
      );

      // Process the pair immediately
      const processStart = Date.now();
      const processedNode = await processNodePair(
        nodeDoc,
        node,
        settings,
        undefined,
        nodeCumulativeRotation,
      );

      console.log(
        `[benchmark][inside nodesToJSON] Single node process: ${Date.now() - processStart}ms`,
      );

      if (processedNode !== null) {
        if (Array.isArray(processedNode)) {
          result.push(...processedNode);
        } else {
          result.push(processedNode);
        }
      }

      // Explicitly try to free memory by clearing reference (JS engine handles this, but good for clarity)
      // nodeDoc is now out of scope for next iteration
    } catch (error) {
      console.error("Error exporting/processing node:", error);
      addWarning(
        `Failed to process node "${node.name}". It might be too complex or contain errors.`,
      );
    }
  }

  console.log(
    `[benchmark][inside nodesToJSON] Total JSON export & process: ${Date.now() - exportJsonStart}ms`,
  );

  return result;
};


import { formatCSS } from "../common/formatCSS";
import { htmlShadowStyles } from "./builderImpl/htmlShadow";
import {
  htmlVisibility,
  htmlRotation,
  htmlOpacity,
  htmlBlendMode,
} from "./builderImpl/htmlBlend";
import {
  buildBackgroundValues,
  htmlColorFromFills,
  getBackgroundPaints,
} from "./builderImpl/htmlColor";
import { htmlPadding } from "./builderImpl/htmlPadding";
import { htmlSizePartial } from "./builderImpl/htmlSize";
import { htmlBorderRadius } from "./builderImpl/htmlBorderRadius";
import {
  commonIsAbsolutePosition,
  getCommonPositionValue,
} from "../common/commonPosition";
import {
  numberToFixedString,
  stringToClassName,
} from "../common/numToAutoFixed";
import { commonStroke } from "../common/commonStroke";
import {
  formatClassAttribute,
  formatDataAttribute,
  formatStyleAttribute,
} from "../common/commonFormatAttributes";
import { HTMLSettings } from "types";
export class HtmlDefaultBuilder {
  styles: Array<string>;
  data: Array<string>;
  node: SceneNode;
  settings: HTMLSettings;
  filters: string[] = [];

  get name() {
    return this.settings.showLayerNames ? this.node.name : "";
  }

  constructor(node: SceneNode, settings: HTMLSettings) {
    this.node = node;
    this.settings = settings;
    this.styles = [];
    this.data = [];
  }

  commonPositionStyles(): this {
    this.size();
    this.autoLayoutPadding();
    this.position();
    this.blend();
    return this;
  }

  commonShapeStyles(): this {
    if ("fills" in this.node) {
      this.applyFillsToStyle(
        this.node.fills,
        this.node.type === "TEXT" ? "text" : "background",
      );
    }
    this.shadow();
    this.border();
    this.blur();
    return this;
  }

  addStyles = (...newStyles: string[]) => {
    this.styles.push(...newStyles.filter((style) => style));
  };

  blend(): this {
    const { node } = this;
    this.addStyles(
      htmlVisibility(node),
      ...htmlRotation(node as LayoutMixin),
      htmlOpacity(node as MinimalBlendMixin),
      htmlBlendMode(node as MinimalBlendMixin),
    );
    return this;
  }

  border(): this {
    const { node } = this;
    this.addStyles(...htmlBorderRadius(node));

    const commonBorder = commonStroke(node);
    if (!commonBorder) {
      return this;
    }

    const strokes = ("strokes" in node && node.strokes) || undefined;
    const color = htmlColorFromFills(strokes as any);
    if (!color) {
      return this;
    }
    const borderStyle =
      "dashPattern" in node && node.dashPattern.length > 0 ? "dotted" : "solid";

    const strokeAlign = "strokeAlign" in node ? node.strokeAlign : "INSIDE";

    // Function to create border value string
    const consolidateBorders = (border: number): string =>
      [`${numberToFixedString(border)}px`, color, borderStyle]
        .filter((d) => d)
        .join(" ");

    if ("all" in commonBorder) {
      if (commonBorder.all === 0) {
        return this;
      }
      const weight = commonBorder.all;

      if (
        strokeAlign === "CENTER" ||
        strokeAlign === "OUTSIDE" ||
        node.type === "FRAME" ||
        node.type === "INSTANCE" ||
        node.type === "COMPONENT"
      ) {
        this.addStyles(formatCSS("outline", consolidateBorders(weight)));
        if (strokeAlign === "CENTER") {
          this.addStyles(
            formatCSS(
              "outline-offset",
              `${numberToFixedString(-weight / 2)}px`,
            ),
          );
        } else if (strokeAlign === "INSIDE") {
          this.addStyles(
            formatCSS("outline-offset", `${numberToFixedString(-weight)}px`),
          );
        }
      } else {
        // Default: use regular border on autolayout + strokeAlign: inside
        this.addStyles(formatCSS("border", consolidateBorders(weight)));
      }
    } else {
      // For non-uniform borders, always use individual border properties
      if (commonBorder.left !== 0) {
        this.addStyles(
          formatCSS("border-left", consolidateBorders(commonBorder.left)),
        );
      }
      if (commonBorder.top !== 0) {
        this.addStyles(
          formatCSS("border-top", consolidateBorders(commonBorder.top)),
        );
      }
      if (commonBorder.right !== 0) {
        this.addStyles(
          formatCSS("border-right", consolidateBorders(commonBorder.right)),
        );
      }
      if (commonBorder.bottom !== 0) {
        this.addStyles(
          formatCSS("border-bottom", consolidateBorders(commonBorder.bottom)),
        );
      }
    }
    return this;
  }

  position(): this {
    const { node } = this;
    const isAbsolutePosition = commonIsAbsolutePosition(node);
    if (isAbsolutePosition) {
      const { x, y } = getCommonPositionValue(node);

      this.addStyles(
        formatCSS("left", x),
        formatCSS("top", y),
        formatCSS("position", "absolute"),
      );

      // Set z-index for absolute positioned elements based on their order
      // Background layers (earlier in list) should have lower z-index
      const parent = node.parent;
      if (parent && "children" in parent && parent.children.length > 0) {
        const visibleChildren = parent.children.filter(
          (child) => child.visible !== false,
        );
        // Find the index of this node in the visible children array
        let nodeIndex = -1;
        for (let i = 0; i < visibleChildren.length; i++) {
          if (visibleChildren[i].id === node.id) {
            nodeIndex = i;
            break;
          }
        }
        // Set z-index based on position: earlier elements (background) get lower z-index
        // First element gets z-index: 0, subsequent elements get incrementing z-index
        if (nodeIndex >= 0) {
          const zIndexValue = nodeIndex.toString();
          this.addStyles(formatCSS("z-index", zIndexValue));
        }
      }
    } else {
      // Check if parent has absolute positioned children
      const parent = node.parent;
      const parentHasAbsoluteChildren =
        parent &&
        "children" in parent &&
        this.hasAbsolutePositionedChildren(parent as SceneNode);

      // Check if this node should be relative positioned
      const shouldBeRelative =
        node.type === "GROUP" ||
        (node as any).isRelative ||
        this.hasAbsolutePositionedChildren(node) ||
        parentHasAbsoluteChildren;

      if (shouldBeRelative) {
        this.addStyles(formatCSS("position", "relative"));

        // If parent has absolute positioned children, MUST set z-index to participate in stacking context
        // This ensures non-absolute children (content layers) appear above absolute children (background layers)
        // Both position: relative and z-index: 1 are required together
        if (parentHasAbsoluteChildren) {
          this.addStyles(formatCSS("z-index", "1"));
        }
      }
    }

    return this;
  }

  // Helper method to check if a node has absolute positioned children
  private hasAbsolutePositionedChildren(node: SceneNode): boolean {
    if (!("children" in node) || !node.children) {
      return false;
    }

    return node.children.some((child) => {
      // Check if child has explicit absolute positioning
      if (
        "layoutPositioning" in child &&
        child.layoutPositioning === "ABSOLUTE"
      ) {
        return true;
      }
      // Check if child would be absolutely positioned based on parent layout
      if (commonIsAbsolutePosition(child)) {
        return true;
      }
      return false;
    });
  }

  applyFillsToStyle(
    paintArray: ReadonlyArray<Paint> | PluginAPI["mixed"],
    property: "text" | "background",
  ): this {
    if (property === "text") {
      this.addStyles(formatCSS("text", htmlColorFromFills(paintArray as any)));
      return this;
    }

    const backgroundValues = buildBackgroundValues(
      paintArray as any,
      this.node,
    );
    if (backgroundValues) {
      this.addStyles(formatCSS("background", backgroundValues));

      // Add blend mode property if multiple fills exist with different blend modes
      if (paintArray !== figma.mixed) {
        const blendModes = this.buildBackgroundBlendModes(paintArray);
        if (blendModes) {
          this.addStyles(formatCSS("background-blend-mode", blendModes));
        }
      }
    }

    return this;
  }

  buildBackgroundBlendModes(paintArray: ReadonlyArray<Paint>): string {
    const paints = getBackgroundPaints(paintArray as any);
    if (
      paints.length === 0 ||
      paints.every(
        (d) => d.blendMode === "NORMAL" || d.blendMode === "PASS_THROUGH",
      )
    ) {
      return "";
    }

    // Reverse the array to match the background order
    const blendModes = [...paints].reverse().flatMap((paint) => {
      const mode =
        paint.blendMode === "PASS_THROUGH"
          ? "normal"
          : (paint.blendMode?.toLowerCase() ?? "normal");
      return Array(paint.type === "GRADIENT_DIAMOND" ? 4 : 1).fill(mode);
    });

    return blendModes.join(", ");
  }

  shadow(): this {
    const { node } = this;
    if ("effects" in node) {
      const shadow = htmlShadowStyles(node);
      if (shadow.boxShadow)
        this.addStyles(formatCSS("box-shadow", shadow.boxShadow));
      if (shadow.filter) this.filters.push(shadow.filter);
    }
    return this;
  }

  size(): this {
    const { node } = this;
    const { width, height, constraints } = htmlSizePartial(node);

    if (node.type === "TEXT") {
      switch (node.textAutoResize) {
        case "WIDTH_AND_HEIGHT":
          // Auto-width text keeps its natural line width, even in a narrow flex row.
          this.addStyles("white-space: nowrap", "flex-shrink: 0");
          break;
        case "HEIGHT":
          this.addStyles(width);
          break;
        case "NONE":
        case "TRUNCATE":
          this.addStyles(width, height);
          break;
      }
    } else {
      this.addStyles(width, height);
    }

    // Add constraints as separate styles
    if (constraints.length > 0) {
      this.addStyles(...constraints);
    }

    return this;
  }

  autoLayoutPadding(): this {
    const { node } = this;
    if ("paddingLeft" in node) {
      this.addStyles(...htmlPadding(node));
    }
    return this;
  }

  blur() {
    const { node } = this;
    if ("effects" in node && node.effects.length > 0) {
      const blur = node.effects.find(
        (e): e is BlurEffect => e.type === "LAYER_BLUR" && e.visible !== false,
      );
      if (blur) {
        this.filters.push(`blur(${numberToFixedString(blur.radius / 2)}px)`);
      }

      const backgroundBlur = node.effects.find(
        (e): e is BlurEffect =>
          e.type === "BACKGROUND_BLUR" && e.visible !== false,
      );
      if (backgroundBlur) {
        this.addStyles(
          formatCSS(
            "backdrop-filter",
            `blur(${numberToFixedString(backgroundBlur.radius / 2)}px)`,
          ),
        );
      }
    }
  }

  addData(label: string, value?: string): this {
    const attribute = formatDataAttribute(label, value);
    this.data.push(attribute);
    return this;
  }

  build(additionalStyle: Array<string> = []): string {
    this.addStyles(...additionalStyle);
    if (this.filters.length)
      this.addStyles(formatCSS("filter", this.filters.join(" ")));
    const classNames: string[] = [];
    if (this.name) {
      this.addData("layer", this.name.trim());
      const layerNameClass = stringToClassName(this.name.trim());
      if (layerNameClass !== "") classNames.push(layerNameClass);
    }

    if ("componentProperties" in this.node && this.node.componentProperties) {
      Object.entries(this.node.componentProperties)
        .map(([name, property]) => {
          if (property.type === "VARIANT" || property.type === "BOOLEAN") {
            const cleanName = name
              .split("#")[0]
              .replace(/\s+/g, "-")
              .toLowerCase();
            return formatDataAttribute(cleanName, String(property.value));
          }
          return "";
        })
        .filter(Boolean)
        .sort()
        .forEach((attribute) => this.data.push(attribute));
    }

    return `${this.data.join("")}${formatClassAttribute(classNames)}${formatStyleAttribute(this.styles)}`;
  }
}

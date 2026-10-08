import { indentString } from "../common/indentString";
import { HtmlTextBuilder } from "./htmlTextBuilder";
import { HtmlDefaultBuilder } from "./htmlDefaultBuilder";
import { htmlAutoLayoutProps } from "./builderImpl/htmlAutoLayout";
import { formatCSS } from "../common/formatCSS";
import { formatStyleAttribute } from "../common/commonFormatAttributes";
import {
  cssMatrix,
  getLinearTransform,
  getTransformedBounds,
} from "../common/nodeGeometry";
import { svgForHTML } from "../common/svgGeometry";
import { commonIsAbsolutePosition } from "../common/commonPosition";
import { htmlRotation } from "./builderImpl/htmlBlend";
import {
  PluginSettings,
  HTMLPreview,
  AltNode,
  HTMLSettings,
  ExportableNode,
} from "types";
import { renderAndAttachSVG } from "../altNodes/altNodeUtils";
import { getVisibleNodes } from "../common/nodeVisibility";
import {
  exportNodeAsBase64PNG,
  getPlaceholderImage,
  nodeHasImageFill,
} from "../common/images";
import { addWarning } from "../common/commonConversionWarnings";

const selfClosingTags = ["img"];

export let isPreviewGlobal = false;

export interface HtmlOutput {
  html: string;
}

export const htmlMain = async (
  sceneNode: Array<SceneNode>,
  settings: PluginSettings,
  isPreview: boolean = false,
): Promise<HtmlOutput> => {
  isPreviewGlobal = isPreview;
  const htmlContent = await htmlWidgetGenerator(sceneNode, settings);
  return {
    html: htmlContent.startsWith("\n") ? htmlContent.slice(1) : htmlContent,
  };
};

export const generateHTMLPreview = async (
  nodes: SceneNode[],
  settings: PluginSettings,
): Promise<HTMLPreview> => {
  let result = await htmlMain(nodes, settings, true);

  if (nodes.length > 1) {
    result.html = `<div style="width: 100%; height: 100%">${result.html}</div>`;
  }

  const sizes = nodes.map((node) => getRootBounds(node));
  return {
    size: {
      width: Math.max(0, ...sizes.map((size) => size.width)),
      height: sizes.reduce((sum, size) => sum + size.height, 0),
    },
    content: result.html,
  };
};

const getRootBounds = (node: SceneNode) => {
  const bounds = getTransformedBounds(
    node.width,
    node.height,
    getLinearTransform(node as AltNode<SceneNode>),
  );
  // Keep effects outside the geometry visible when a root is selected alone.
  const render =
    "absoluteRenderBounds" in node ? node.absoluteRenderBounds : null;
  if (!render || !node.absoluteTransform) return bounds;
  const x = Math.min(bounds.x, render.x - node.absoluteTransform[0][2]);
  const y = Math.min(bounds.y, render.y - node.absoluteTransform[1][2]);
  return {
    x,
    y,
    width:
      Math.max(
        bounds.x + bounds.width,
        render.x + render.width - node.absoluteTransform[0][2],
      ) - x,
    height:
      Math.max(
        bounds.y + bounds.height,
        render.y + render.height - node.absoluteTransform[1][2],
      ) - y,
  };
};

const htmlWidgetGenerator = async (
  sceneNode: ReadonlyArray<SceneNode>,
  settings: HTMLSettings,
): Promise<string> => {
  // filter non visible nodes. This is necessary at this step because conversion already happened.
  const promiseOfConvertedCode = getVisibleNodes(sceneNode).map(
    async (node) => {
      // Cache on the actual converted node before creating a root preview copy.
      // SVG Assets and the second HTML/preview pass reuse the same export.
      if (
        settings.embedVectors &&
        (node as AltNode<SceneNode>).canBeFlattened &&
        !(node as any).isMask
      ) {
        await renderAndAttachSVG(node);
      }
      const bounds =
        isPreviewGlobal && !node.parent ? getRootBounds(node) : null;
      if (bounds) {
        // This canvas is preview-only. Exported nodes keep their layout size,
        // while transforms/effects/overflow may extend beyond that size.
        const content = await convertNode(settings)({
          ...node,
          x: -bounds.x,
          y: -bounds.y,
          layoutPositioning: "ABSOLUTE",
          previewRoot: true,
        } as SceneNode & { previewRoot: boolean });
        if (!content) return "";
        const style = formatStyleAttribute([
          "position: relative",
          formatCSS("width", bounds.width),
          formatCSS("height", bounds.height),
        ]);
        return `\n<div${style}>${indentString(content)}\n</div>`;
      }
      return convertNode(settings)(node);
    },
  );
  const code = (await Promise.all(promiseOfConvertedCode)).join("");
  return code;
};

const convertNode = (settings: HTMLSettings) => async (node: SceneNode) => {
  // Skip mask nodes - they are not rendered as visual elements, only used to clip siblings
  if ((node as any).isMask === true) {
    return "";
  }

  // Embed SVGs only when the user explicitly enables it.
  if (settings.embedVectors && (node as any).canBeFlattened) {
    const altNode = node as AltNode<SceneNode>;
    if (altNode.svg && altNode.svgGeometry) {
      return htmlWrapSVG(altNode, settings);
    }
  }

  switch (node.type) {
    case "RECTANGLE":
    case "ELLIPSE":
      return await htmlContainer(node, "", [], settings);
    case "GROUP":
      return await htmlGroup(node, settings);
    case "FRAME":
    case "COMPONENT":
    case "INSTANCE":
    case "COMPONENT_SET":
      return await htmlFrame(node, settings);
    case "SECTION":
      return await htmlSection(node, settings);
    case "TEXT":
      return htmlText(node, settings);
    case "LINE":
      return htmlLine(node, settings);
    case "VECTOR":
      if (!settings.embedVectors && !isPreviewGlobal) {
        addWarning("Vector is not supported");
      }
      return await htmlContainer(
        { ...node, type: "RECTANGLE" } as any,
        "",
        [],
        settings,
      );
    default:
      addWarning(`${node.type} node is not supported`);
      return "";
  }
};

const htmlWrapSVG = (
  node: AltNode<SceneNode>,
  settings: HTMLSettings,
): string => {
  if (node.svg === "") return "";

  if (!node.svgGeometry) return "";

  // The SVG viewport is absolutely positioned; reserve the node's layout box
  // even for HUG icons. FILL still participates in its parent's flex layout.
  const layoutNode = {
    ...node,
    layoutSizingHorizontal:
      "layoutSizingHorizontal" in node && node.layoutSizingHorizontal === "FILL"
        ? "FILL"
        : "FIXED",
    layoutSizingVertical:
      "layoutSizingVertical" in node && node.layoutSizingVertical === "FILL"
        ? "FILL"
        : "FIXED",
  } as AltNode<SceneNode>;

  const builder = new HtmlDefaultBuilder(layoutNode, settings)
    .addData("svg-wrapper")
    .size()
    .position();
  if (!commonIsAbsolutePosition(node)) builder.addStyles("position: relative");
  builder.addStyles(...htmlRotation(node), "overflow: visible");

  // The SVG content already has the var() references, so we don't need
  // to add inline CSS variables in most cases. The browser will use the fallbacks
  // if the variables aren't defined in the CSS.

  const viewportStyle = formatStyleAttribute([
    "position: absolute",
    "left: 0",
    "top: 0",
    "transform-origin: top left",
    formatCSS("transform", cssMatrix(node.svgGeometry.viewportToLocal)),
    formatCSS("width", node.svgGeometry.viewport.width),
    formatCSS("height", node.svgGeometry.viewport.height),
  ]);
  return `\n<div${builder.build()}>\n${indentString(`<div${viewportStyle}>${svgForHTML(node.svg ?? "", node.svgGeometry)}</div>`)}\n</div>`;
};

const htmlGroup = async (
  node: GroupNode,
  settings: HTMLSettings,
): Promise<string> => {
  // ignore the view when size is zero or less
  // while technically it shouldn't get less than 0, due to rounding errors,
  // it can get to values like: -0.000004196293048153166
  // also ignore if there are no children inside, which makes no sense
  if (node.width < 0 || node.height <= 0 || node.children.length === 0) {
    return "";
  }

  // this needs to be called after CustomNode because widthHeight depends on it
  const builder = new HtmlDefaultBuilder(node, settings).commonPositionStyles();

  if (builder.styles) {
    const attr = builder.build();
    const generator = await htmlWidgetGenerator(node.children, settings);
    return `\n<div${attr}>${indentString(generator)}\n</div>`;
  }
  return await htmlWidgetGenerator(node.children, settings);
};

const htmlText = (node: TextNode, settings: HTMLSettings): string => {
  const layoutBuilder = new HtmlTextBuilder(node, settings)
    .commonPositionStyles()
    .textTrim()
    .textAlignHorizontal()
    .textAlignVertical();

  const styledHtml = layoutBuilder.getTextSegments(node);
  let content = "";
  if (styledHtml.length === 1) {
    layoutBuilder.addStyles(styledHtml[0].style);
    content = styledHtml[0].text;
    const additionalTag =
      styledHtml[0].openTypeFeatures.SUBS === true
        ? "sub"
        : styledHtml[0].openTypeFeatures.SUPS === true
          ? "sup"
          : "";
    if (additionalTag) {
      content = `<${additionalTag}>${content}</${additionalTag}>`;
    }
  } else {
    content = styledHtml
      .map((style) => {
        const tag =
          style.openTypeFeatures.SUBS === true
            ? "sub"
            : style.openTypeFeatures.SUPS === true
              ? "sup"
              : "span";
        return `<${tag}${formatStyleAttribute([style.style])}>${style.text}</${tag}>`;
      })
      .join("");
  }
  return `\n<div${layoutBuilder.build()}>${content}</div>`;
};

const htmlFrame = async (
  node: SceneNode & BaseFrameMixin,
  settings: HTMLSettings,
): Promise<string> => {
  const childrenStr = await htmlWidgetGenerator(node.children, settings);

  if (node.layoutMode !== "NONE") {
    const rowColumn = htmlAutoLayoutProps(node);
    return await htmlContainer(node, childrenStr, rowColumn, settings);
  }

  // node.layoutMode === "NONE" && node.children.length > 1
  // children needs to be absolute
  return await htmlContainer(node, childrenStr, [], settings);
};

// properties named propSomething always take care of ","
// sometimes a property might not exist, so it doesn't add ","
const htmlContainer = async (
  node: SceneNode &
    SceneNodeMixin &
    BlendMixin &
    LayoutMixin &
    GeometryMixin &
    MinimalBlendMixin,
  children: string,
  additionalStyles: string[] = [],
  settings: HTMLSettings,
): Promise<string> => {
  // ignore the view when size is zero or less
  if (node.width <= 0 || node.height <= 0) {
    return children;
  }

  const builder = new HtmlDefaultBuilder(node, settings)
    .commonPositionStyles()
    .commonShapeStyles();

  if (builder.styles || additionalStyles) {
    let tag = "div";
    let src = "";

    if (nodeHasImageFill(node)) {
      const altNode = node as AltNode<ExportableNode>;
      const hasChildren = "children" in node && node.children.length > 0;
      let imgUrl = "";

      if (settings.embedImages) {
        imgUrl = (await exportNodeAsBase64PNG(altNode, hasChildren)) ?? "";
      } else {
        imgUrl = getPlaceholderImage(node.width, node.height);
        console.log("imgUrl", imgUrl);
      }

      if (hasChildren) {
        builder.addStyles(formatCSS("background-image", `url(${imgUrl})`));
      } else {
        tag = "img";
        src = ` src="${imgUrl}"`;
        // Many preview environments apply global resets like:
        //   img { max-width: 100%; height: auto; }
        // That can override the intended absolute pixel sizing and create gaps.
        // Force-disable those constraints for exported image layers.
        builder.addStyles(
          formatCSS("max-width", "none"),
          formatCSS("max-height", "none"),
          formatCSS("display", "block"),
        );
      }
    }

    const build = builder.build(additionalStyles);
    if (children) {
      return `\n<${tag}${build}${src}>${indentString(children)}\n</${tag}>`;
    } else if (selfClosingTags.includes(tag)) {
      return `\n<${tag}${build}${src} />`;
    } else {
      return `\n<${tag}${build}${src}></${tag}>`;
    }
  }

  return children;
};

const htmlSection = async (
  node: SectionNode,
  settings: HTMLSettings,
): Promise<string> => {
  const childrenStr = await htmlWidgetGenerator(node.children, settings);
  const builder = new HtmlDefaultBuilder(node, settings)
    .size()
    .position()
    .applyFillsToStyle(node.fills, "background");

  if (childrenStr) {
    return `\n<div${builder.build()}>${indentString(childrenStr)}\n</div>`;
  } else {
    return `\n<div${builder.build()}></div>`;
  }
};

const htmlLine = (node: LineNode, settings: HTMLSettings): string => {
  const builder = new HtmlDefaultBuilder(node, settings)
    .commonPositionStyles()
    .commonShapeStyles();

  return `\n<div${builder.build()}></div>`;
};

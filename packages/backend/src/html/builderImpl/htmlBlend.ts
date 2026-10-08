import { numberToFixedString } from "../../common/numToAutoFixed";
import { formatCSS } from "../../common/formatCSS";

// Opacity is unitless and ranges from 0 to 1.
export const htmlOpacity = (node: MinimalBlendMixin): string => {
  // [when testing] node.opacity can be undefined
  if (node.opacity !== undefined && node.opacity !== 1) {
    return `opacity: ${numberToFixedString(node.opacity)}`;
  }
  return "";
};

export const htmlBlendMode = (node: MinimalBlendMixin): string => {
  if (node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
    let blendMode = "";
    switch (node.blendMode) {
      case "MULTIPLY":
        blendMode = "multiply";
        break;
      case "SCREEN":
        blendMode = "screen";
        break;
      case "OVERLAY":
        blendMode = "overlay";
        break;
      case "DARKEN":
        blendMode = "darken";
        break;
      case "LIGHTEN":
        blendMode = "lighten";
        break;
      case "COLOR_DODGE":
        blendMode = "color-dodge";
        break;
      case "COLOR_BURN":
        blendMode = "color-burn";
        break;
      case "HARD_LIGHT":
        blendMode = "hard-light";
        break;
      case "SOFT_LIGHT":
        blendMode = "soft-light";
        break;
      case "DIFFERENCE":
        blendMode = "difference";
        break;
      case "EXCLUSION":
        blendMode = "exclusion";
        break;
      case "HUE":
        blendMode = "hue";
        break;
      case "SATURATION":
        blendMode = "saturation";
        break;
      case "COLOR":
        blendMode = "color";
        break;
      case "LUMINOSITY":
        blendMode = "luminosity";
        break;
    }

    if (blendMode) {
      return formatCSS("mix-blend-mode", blendMode);
    }
  }
  return "";
};

export const htmlVisibility = (node: SceneNodeMixin): string => {
  // [when testing] node.visible can be undefined

  // When something is invisible in Figma, it isn't gone. Groups can make use of it.
  // Therefore, instead of changing the visibility (which causes bugs in nested divs),
  // this plugin is going to ignore color and stroke
  if (node.visible !== undefined && !node.visible) {
    return formatCSS("visibility", "hidden");
  }
  return "";
};

export const htmlRotation = (node: { rotation?: number; cumulativeRotation?: number }): string[] => {
  const rotation = -Math.round((node.rotation || 0) + (node.cumulativeRotation || 0)) || 0;

  if (rotation !== 0) {
    return [
      formatCSS("transform", `rotate(${numberToFixedString(rotation)}deg)`),
      formatCSS("transform-origin", "top left"),
    ];
  }
  return [];
};

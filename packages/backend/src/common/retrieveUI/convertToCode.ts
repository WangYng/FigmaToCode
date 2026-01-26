import { PluginSettings } from "types";
import { htmlMain } from "../../html/htmlMain";

export const convertToCode = async (
  nodes: SceneNode[],
  settings: PluginSettings,
) => {
  // HTML-only mode: always generate HTML.
  return (await htmlMain(nodes, settings)).html;
};

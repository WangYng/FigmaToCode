import { htmlMain, run, postSettingsChanged } from "backend";
import { nodesToJSON } from "backend/src/altNodes/jsonNodeConversion";
import { PluginSettings, SettingWillChangeMessage } from "types";

let userPluginSettings: PluginSettings;

export const defaultPluginSettings: PluginSettings = {
  showLayerNames: true,
  responsiveRoot: false,
  useColorVariables: true,
  embedImages: false,
  embedVectors: true,
  embedVectorsMaxSize: 64,
};

// A helper type guard to ensure the key belongs to the PluginSettings type
function isKeyOfPluginSettings(key: string): key is keyof PluginSettings {
  return Object.prototype.hasOwnProperty.call(defaultPluginSettings, key);
}

const getUserSettings = async () => {
  console.log("[DEBUG] getUserSettings - Starting to fetch user settings");
  const possiblePluginSrcSettings =
    (await figma.clientStorage.getAsync("userPluginSettings")) ?? {};
  console.log(
    "[DEBUG] getUserSettings - Raw settings from storage:",
    possiblePluginSrcSettings,
  );

  const updatedPluginSrcSettings = {
    ...defaultPluginSettings,
    ...Object.keys(defaultPluginSettings).reduce((validSettings, key) => {
      if (
        isKeyOfPluginSettings(key) &&
        key in possiblePluginSrcSettings &&
        typeof possiblePluginSrcSettings[key] ===
          typeof defaultPluginSettings[key]
      ) {
        validSettings[key] = possiblePluginSrcSettings[key] as any;
      }
      return validSettings;
    }, {} as Partial<PluginSettings>),
  };

  userPluginSettings = updatedPluginSrcSettings as PluginSettings;
  // Persist only supported settings when upgrading from an earlier version.
  await figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
  console.log("[DEBUG] getUserSettings - Final settings:", userPluginSettings);
  return userPluginSettings;
};

const initSettings = async () => {
  console.log("[DEBUG] initSettings - Initializing plugin settings");
  await getUserSettings();
  postSettingsChanged(userPluginSettings);
  console.log("[DEBUG] initSettings - Calling safeRun with settings");
  safeRun(userPluginSettings);
};

// Used to prevent running from happening again.
let isLoading = false;
const safeRun = async (settings: PluginSettings) => {
  console.log(
    "[DEBUG] safeRun - Called with isLoading =",
    isLoading,
    "selection =",
    figma.currentPage.selection,
  );
  if (isLoading === false) {
    try {
      isLoading = true;
      console.log("[DEBUG] safeRun - Starting run execution");
      await run(settings);
      console.log("[DEBUG] safeRun - Run execution completed");
      // hack to make it not immediately set to false when complete. (executes on next frame)
      setTimeout(() => {
        console.log("[DEBUG] safeRun - Resetting isLoading to false");
        isLoading = false;
      }, 1);
    } catch (e) {
      console.log("[DEBUG] safeRun - Error caught in execution");
      isLoading = false; // Make sure to reset the flag on error
      if (e && typeof e === "object" && "message" in e) {
        const error = e as Error;
        console.log("error: ", error.stack);
        figma.ui.postMessage({ type: "error", error: error.message });
      } else {
        // Handle non-standard errors or unknown error types
        const errorMessage = String(e);
        console.log("Unknown error: ", errorMessage);
        figma.ui.postMessage({
          type: "error",
          error: errorMessage || "Unknown error occurred",
        });
      }

      // Send a message to reset the UI state
      figma.ui.postMessage({ type: "conversion-complete", success: false });
    }
  } else {
    console.log(
      "[DEBUG] safeRun - Skipping execution because isLoading =",
      isLoading,
    );
  }
};

const standardMode = async () => {
  console.log("[DEBUG] standardMode - Starting standard mode initialization");
  figma.showUI(__html__, { width: 450, height: 700, themeColors: true });
  await initSettings();

  // Listen for selection changes
  figma.on("selectionchange", () => {
    console.log(
      "[DEBUG] selectionchange event - New selection:",
      figma.currentPage.selection,
    );
    safeRun(userPluginSettings);
  });

  // Listen for page changes
  figma.loadAllPagesAsync();
  // NOTE: Intentionally do NOT re-run conversion on `documentchange`.
  // This event is very noisy (it can fire during conversion and for unrelated edits),
  // which leads to frequent "Converting Design" loading flashes.

  figma.ui.onmessage = async (msg) => {
    console.log("[DEBUG] figma.ui.onmessage", msg);

    if (msg.type === "pluginSettingWillChange") {
      const { key, value } = msg as SettingWillChangeMessage<unknown>;
      console.log(`[DEBUG] Setting changed: ${key} = ${value}`);
      if (
        !isKeyOfPluginSettings(key) ||
        typeof value !== typeof defaultPluginSettings[key]
      )
        return;
      (userPluginSettings as any)[key] = value;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
      postSettingsChanged(userPluginSettings);
      safeRun(userPluginSettings);
    } else if (msg.type === "get-selection-json") {
      console.log("[DEBUG] get-selection-json message received");

      const nodes = figma.currentPage.selection;
      if (nodes.length === 0) {
        figma.ui.postMessage({
          type: "selection-json",
          data: { message: "No nodes selected" },
        });
        return;
      }
      const result: {
        json?: SceneNode[];
        newConversion?: any;
      } = {};

      try {
        result.json = (await Promise.all(
          nodes.map(
            async (node) =>
              (
                (await node.exportAsync({
                  format: "JSON_REST_V1",
                })) as any
              ).document,
          ),
        )) as SceneNode[];
      } catch (error) {
        console.error("Error exporting JSON:", error);
      }

      try {
        const newNodes = await nodesToJSON(nodes, userPluginSettings);
        const removeParent = (node: any) => {
          if (node.parent) {
            delete node.parent;
          }
          if (node.children) {
            node.children.forEach(removeParent);
          }
        };
        newNodes.forEach(removeParent);
        result.newConversion = newNodes;
      } catch (error) {
        console.error("Error in new conversion:", error);
      }

      const nodeJson = result;

      console.log("[DEBUG] Exported node JSON:", nodeJson);

      // Send the JSON data back to the UI
      figma.ui.postMessage({
        type: "selection-json",
        data: nodeJson,
      });
    }
  };
};

const codegenMode = async () => {
  console.log("[DEBUG] codegenMode - Starting codegen mode initialization");
  // figma.showUI(__html__, { visible: false });
  await getUserSettings();

  figma.codegen.on(
    "generate",
    async ({ node }: CodegenEvent): Promise<CodegenResult[]> => {
      console.log("[DEBUG] codegen.generate - Node:", node);

      const convertedSelection = await nodesToJSON([node], userPluginSettings);
      console.log(
        "[DEBUG] codegen.generate - Converted selection:",
        convertedSelection,
      );

      const html = (
        await htmlMain(convertedSelection as any, userPluginSettings)
      ).html;

      return [
        {
          title: "Code",
          code: html,
          language: "HTML",
        },
      ];
    },
  );
};

switch (figma.mode) {
  case "default":
  case "inspect":
    console.log("[DEBUG] Starting plugin in", figma.mode, "mode");
    standardMode();
    break;
  case "codegen":
    console.log("[DEBUG] Starting plugin in codegen mode");
    codegenMode();
    break;
  default:
    console.log("[DEBUG] Unknown plugin mode:", figma.mode);
    break;
}

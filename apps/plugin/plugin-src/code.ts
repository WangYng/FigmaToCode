import {
  run,
  postSettingsChanged,
} from "backend";
import { nodesToJSON } from "backend/src/altNodes/jsonNodeConversion";
import { retrieveGenericSolidUIColors } from "backend/src/common/retrieveUI/retrieveColors";
import { PluginSettings, SettingWillChangeMessage } from "types";

let userPluginSettings: PluginSettings;

export const defaultPluginSettings: PluginSettings = {
  framework: "HTML",
  showLayerNames: false,
  useOldPluginVersion2025: false,
  responsiveRoot: false,
  flutterGenerationMode: "snippet",
  swiftUIGenerationMode: "snippet",
  composeGenerationMode: "snippet",
  roundTailwindValues: true,
  roundTailwindColors: true,
  useColorVariables: true,
  customTailwindPrefix: "",
  embedImages: false,
  embedVectors: false,
  embedVectorsMaxSize: 64,
  htmlGenerationMode: "html",
  tailwindGenerationMode: "jsx",
  baseFontSize: 16,
  useTailwind4: false,
  thresholdPercent: 15,
  baseFontFamily: "",
  fontFamilyCustomConfig: {},
};

// A helper type guard to ensure the key belongs to the PluginSettings type
function isKeyOfPluginSettings(key: string): key is keyof PluginSettings {
  return key in defaultPluginSettings;
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
  console.log("[DEBUG] getUserSettings - Final settings:", userPluginSettings);
  return userPluginSettings;
};

const initSettings = async () => {
  console.log("[DEBUG] initSettings - Initializing plugin settings");
  await getUserSettings();
  // HTML-only mode
  userPluginSettings.framework = "HTML";
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
      if (key === "framework") {
        // HTML-only mode: ignore framework changes
        (userPluginSettings as any).framework = "HTML";
        figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
        postSettingsChanged(userPluginSettings);
        safeRun(userPluginSettings);
        return;
      }
      (userPluginSettings as any)[key] = value;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
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
        oldConversion?: any;
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
    async ({ language, node }: CodegenEvent): Promise<CodegenResult[]> => {
      console.log(
        `[DEBUG] codegen.generate - Language: ${language}, Node:`,
        node,
      );

      const convertedSelection = await nodesToJSON([node], userPluginSettings);
      console.log(
        "[DEBUG] codegen.generate - Converted selection:",
        convertedSelection,
      );

      switch (language) {
        case "html":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "html" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];
        case "html_jsx":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "jsx" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_svelte":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "svelte" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_styled_components":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  {
                    ...userPluginSettings,
                    htmlGenerationMode: "styled-components",
                  },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "tailwind":
        case "tailwind_jsx":
          return [
            {
              title: "Code",
              code: await tailwindMain(convertedSelection, {
                ...userPluginSettings,
                tailwindGenerationMode:
                  language === "tailwind_jsx" ? "jsx" : "html",
              }),
              language: "HTML",
            },
            // {
            //   title: "Style",
            //   code: tailwindMain(convertedSelection, defaultPluginSettings),
            //   language: "HTML",
            // },
            {
              title: "Tailwind Colors",
              code: (await retrieveGenericSolidUIColors("Tailwind"))
                .map((d) => {
                  let str = `${d.hex};`;
                  if (d.colorName !== d.hex) {
                    str += ` // ${d.colorName}`;
                  }
                  if (d.meta) {
                    str += ` (${d.meta})`;
                  }
                  return str;
                })
                .join("\n"),
              language: "JAVASCRIPT",
            },
            {
              title: "Text Styles",
              code: tailwindCodeGenTextStyles(),
              language: "HTML",
            },
          ];
        case "flutter":
          return [
            {
              title: "Code",
              code: flutterMain(convertedSelection, {
                ...userPluginSettings,
                flutterGenerationMode: "snippet",
              }),
              language: "SWIFT",
            },
            {
              title: "Text Styles",
              code: flutterCodeGenTextStyles(),
              language: "SWIFT",
            },
          ];
        case "swiftUI":
          return [
            {
              title: "SwiftUI",
              code: swiftuiMain(convertedSelection, {
                ...userPluginSettings,
                swiftUIGenerationMode: "snippet",
              }),
              language: "SWIFT",
            },
            {
              title: "Text Styles",
              code: swiftUICodeGenTextStyles(),
              language: "SWIFT",
            },
          ];
        // case "compose":
        //   return [
        //     {
        //       title: "Jetpack Compose",
        //       code: composeMain(convertedSelection, {
        //         ...userPluginSettings,
        //         composeGenerationMode: "snippet",
        //       }),
        //       language: "KOTLIN",
        //     },
        //     {
        //       title: "Text Styles",
        //       code: composeCodeGenTextStyles(),
        //       language: "KOTLIN",
        //     },
        //   ];
        default:
          break;
      }

      const blocks: CodegenResult[] = [];
      return blocks;
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

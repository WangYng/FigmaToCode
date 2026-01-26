import { LocalCodegenPreferenceOptions, SelectPreferenceOptions } from "types";

export const preferenceOptions: LocalCodegenPreferenceOptions[] = [
  {
    itemType: "individual_select",
    propertyName: "showLayerNames",
    label: "Layer names",
    description: "Include Figma layer names in classes.",
    isDefault: false,
    includedLanguages: ["HTML"],
  },
  {
    itemType: "individual_select",
    propertyName: "useColorVariables",
    label: "Color Variables",
    description:
      "Export code using Figma variables as colors. Example: 'bg-background' instead of 'bg-white'.",
    isDefault: true,
    includedLanguages: ["HTML"],
  },
  {
    itemType: "individual_select",
    propertyName: "embedImages",
    label: "Embed Images",
    description:
      "Convert Figma images to Base64 and embed them in the code. This may be slow. If there are too many images, it could freeze Figma.",
    isDefault: false,
    includedLanguages: ["HTML"],
  },
  {
    itemType: "individual_select",
    propertyName: "embedVectors",
    label: "Embed Vectors",
    description:
      "Enable this to convert vector shapes to SVGs and embed them in the design. This can be a slow operation. If unchecked, shapes will be converted into rectangles.",
    isDefault: false,
    includedLanguages: ["HTML"],
  },
];

export const selectPreferenceOptions: SelectPreferenceOptions[] = [
  {
    itemType: "select",
    propertyName: "htmlGenerationMode",
    label: "Mode",
    options: [
      { label: "HTML", value: "html" },
      { label: "React (JSX)", value: "jsx" },
      { label: "Svelte", value: "svelte" },
      { label: "styled-components", value: "styled-components" },
    ],
    includedLanguages: ["HTML"],
  },
  {
    itemType: "select",
    propertyName: "embedVectorsMaxSize",
    label: "SVG Max Size",
    options: [
      { label: "64", value: "64", isDefault: true },
      { label: "128", value: "128" },
      { label: "256", value: "256" },
      { label: "512", value: "512" },
    ],
    includedLanguages: ["HTML"],
  },
];

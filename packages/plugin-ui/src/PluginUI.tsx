import copy from "copy-to-clipboard";
import Preview from "./components/Preview";
import GradientsPanel from "./components/GradientsPanel";
import ColorsPanel from "./components/ColorsPanel";
import CodePanel from "./components/CodePanel";
import WarningsPanel from "./components/WarningsPanel";
import {
  HTMLPreview,
  LinearGradientConversion,
  PluginSettings,
  SolidColorConversion,
  Warning,
} from "types";
import {
  preferenceOptions,
  selectPreferenceOptions,
} from "./codegenPreferenceOptions";
import Loading from "./components/Loading";
import { useState } from "react";
import React from "react";

type PluginUIProps = {
  code: string;
  htmlPreview: HTMLPreview;
  warnings: Warning[];
  settings: PluginSettings | null;
  onPreferenceChanged: (
    key: keyof PluginSettings,
    value: boolean | string | number,
  ) => void;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  isLoading: boolean;
  onDownloadNode?: () => void;
};

export const PluginUI = (props: PluginUIProps) => {
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewViewMode, setPreviewViewMode] = useState<
    "desktop" | "mobile" | "precision"
  >("precision");
  const [previewBgColor, setPreviewBgColor] = useState<"white" | "black">(
    "white",
  );

  if (props.isLoading) return <Loading />;

  const isEmpty = props.code === "";
  const warnings = props.warnings ?? [];

  return (
    <div className="flex flex-col h-full dark:text-white">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col items-center px-4 py-2 gap-2 dark:bg-transparent">
          {isEmpty === false && props.htmlPreview && (
            <div
              className="w-full resize-y overflow-hidden"
              style={{
                minHeight: 600,
                height: 600,
              }}
            >
              <Preview
                htmlPreview={props.htmlPreview}
                expanded={previewExpanded}
                setExpanded={setPreviewExpanded}
                viewMode={previewViewMode}
                setViewMode={setPreviewViewMode}
                bgColor={previewBgColor}
                setBgColor={setPreviewBgColor}
              />
            </div>
          )}

          {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

          <CodePanel
            code={props.code}
            preferenceOptions={preferenceOptions}
            selectPreferenceOptions={selectPreferenceOptions}
            settings={props.settings}
            onPreferenceChanged={props.onPreferenceChanged}
          />

          {props.colors.length > 0 && (
            <ColorsPanel
              colors={props.colors}
              onColorClick={(value) => {
                copy(value);
              }}
            />
          )}

          {props.gradients.length > 0 && (
            <GradientsPanel
              gradients={props.gradients}
              onColorClick={(value) => {
                copy(value);
              }}
            />
          )}

          {props.onDownloadNode && (
            <button
              className="w-full h-9 flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => props.onDownloadNode?.()}
              aria-label="Download selected node JSON"
            >
              Download Node JSON
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

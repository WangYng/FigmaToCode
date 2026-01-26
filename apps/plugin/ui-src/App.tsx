import { useEffect, useRef, useState } from "react";
import { PluginUI } from "plugin-ui";
import {
  PluginSettings,
  ConversionMessage,
  Message,
  HTMLPreview,
  LinearGradientConversion,
  SolidColorConversion,
  ErrorMessage,
  SettingsChangedMessage,
  Warning,
} from "types";
import { postUIMessage, postUISettingsChangingMessage } from "./messaging";
import copy from "copy-to-clipboard";

interface AppState {
  code: string;
  isLoading: boolean;
  hasSelection: boolean;
  htmlPreview: HTMLPreview;
  settings: PluginSettings | null;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
}

const emptyPreview = { size: { width: 0, height: 0 }, content: "" };

function sanitizeFilePart(input: string) {
  // Keep filenames cross-platform safe-ish.
  return input
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function downloadJson(data: unknown, filename: string) {
  const jsonText = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [state, setState] = useState<AppState>({
    code: "",
    isLoading: false,
    hasSelection: false,
    htmlPreview: emptyPreview,
    settings: null,
    colors: [],
    gradients: [],
    warnings: [],
  });

  const rootStyles = getComputedStyle(document.documentElement);
  const figmaColorBgValue = rootStyles
    .getPropertyValue("--figma-color-bg")
    .trim();

  const chunkedCodeRef = useRef<{
    totalChunks: number;
    chunks: string[];
    payload: Omit<ConversionMessage, "type" | "code">;
  } | null>(null);

  const chunkedPreviewRef = useRef<{
    totalChunks: number;
    chunks: string[];
    size: { width: number; height: number };
  } | null>(null);

  const pendingLargeRef = useRef<{
    payload: any;
    code?: string;
    htmlPreview?: HTMLPreview;
  } | null>(null);

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const untypedMessage = event.data.pluginMessage as Message;
      console.log("[ui] message received:", untypedMessage);

      switch (untypedMessage.type) {
        case "conversionStart":
          pendingLargeRef.current = null;
          chunkedPreviewRef.current = null;
          chunkedCodeRef.current = null;
          setState((prevState) => ({
            ...prevState,
            code: "",
            isLoading: true,
            hasSelection: true,
          }));
          break;

        case "code":
          const conversionMessage = untypedMessage as ConversionMessage;
          setState((prevState) => ({
            ...prevState,
            ...conversionMessage,
            isLoading: false,
            hasSelection: true,
          }));
          break;

        case "codeChunkStart": {
          const msg = untypedMessage as any;
          const totalChunks =
            typeof msg.totalChunks === "number" ? msg.totalChunks : 0;

          // Keep only the conversion payload fields; code will arrive via chunks.
          const { totalChunks: _tc, type: _t, ...payload } = msg;
          chunkedCodeRef.current = {
            totalChunks,
            chunks: new Array(totalChunks).fill(""),
            payload,
          };
          if (payload?.previewChunked) {
            pendingLargeRef.current = { payload };
          }
          break;
        }

        case "codeChunk": {
          const msg = untypedMessage as any;
          const active = chunkedCodeRef.current;
          if (!active) break;
          const index = typeof msg.index === "number" ? msg.index : -1;
          if (index < 0 || index >= active.totalChunks) break;
          active.chunks[index] = typeof msg.chunk === "string" ? msg.chunk : "";
          break;
        }

        case "codeChunkEnd": {
          const active = chunkedCodeRef.current;
          if (!active) break;
          const code = active.chunks.join("");
          const payload = active.payload as any;
          chunkedCodeRef.current = null;
          // If preview is chunked, wait until previewChunkEnd so preview and code stay consistent.
          if (payload?.previewChunked) {
            if (!pendingLargeRef.current) pendingLargeRef.current = { payload };
            pendingLargeRef.current.code = code;
            if (pendingLargeRef.current.htmlPreview) {
              const full = pendingLargeRef.current;
              pendingLargeRef.current = null;
              setState((prevState) => ({
                ...prevState,
                ...full.payload,
                code: full.code ?? "",
                htmlPreview: full.htmlPreview ?? emptyPreview,
                isLoading: false,
                hasSelection: true,
              }));
            }
            break;
          }

          setState((prevState) => ({
            ...prevState,
            ...payload,
            code,
            isLoading: false,
            hasSelection: true,
          }));
          break;
        }

        case "previewChunkStart": {
          const msg = untypedMessage as any;
          const totalChunks =
            typeof msg.totalChunks === "number" ? msg.totalChunks : 0;
          const size =
            msg.size && typeof msg.size.width === "number" && typeof msg.size.height === "number"
              ? msg.size
              : { width: 0, height: 0 };
          chunkedPreviewRef.current = {
            totalChunks,
            chunks: new Array(totalChunks).fill(""),
            size,
          };
          break;
        }

        case "previewChunk": {
          const msg = untypedMessage as any;
          const active = chunkedPreviewRef.current;
          if (!active) break;
          const index = typeof msg.index === "number" ? msg.index : -1;
          if (index < 0 || index >= active.totalChunks) break;
          active.chunks[index] = typeof msg.chunk === "string" ? msg.chunk : "";
          break;
        }

        case "previewChunkEnd": {
          const active = chunkedPreviewRef.current;
          if (!active) break;
          const content = active.chunks.join("");
          const htmlPreview = { size: active.size, content };
          chunkedPreviewRef.current = null;

          if (pendingLargeRef.current) {
            pendingLargeRef.current.htmlPreview = htmlPreview;
            if (pendingLargeRef.current.code !== undefined) {
              const full = pendingLargeRef.current;
              pendingLargeRef.current = null;
              setState((prevState) => ({
                ...prevState,
                ...full.payload,
                code: full.code ?? "",
                htmlPreview: full.htmlPreview ?? emptyPreview,
                isLoading: false,
                hasSelection: true,
              }));
            }
          } else {
            // Fallback: update preview only.
            setState((prevState) => ({
              ...prevState,
              htmlPreview,
            }));
          }
          break;
        }

        case "pluginSettingChanged":
          const settingsMessage = untypedMessage as SettingsChangedMessage;
          setState((prevState) => ({
            ...prevState,
            settings: settingsMessage.settings,
          }));
          break;

        case "empty":
          // const emptyMessage = untypedMessage as EmptyMessage;
          setState((prevState) => ({
            ...prevState,
            code: "",
            htmlPreview: emptyPreview,
            warnings: [],
            colors: [],
            gradients: [],
            isLoading: false,
            hasSelection: false,
          }));
          break;

        case "error":
          const errorMessage = untypedMessage as ErrorMessage;

          setState((prevState) => ({
            ...prevState,
            colors: [],
            gradients: [],
            code: `Error :(\n// ${errorMessage.error}`,
            isLoading: false,
          }));
          break;

        case "selection-json":
          try {
            const payload = event.data.pluginMessage.data as any;
            if (payload?.message && typeof payload.message === "string") {
              // Keep it simple: don't download a file when there's no selection.
              window.alert(payload.message);
              setState((prevState) => ({ ...prevState, hasSelection: false }));
              break;
            }

            const firstName =
              payload?.json?.[0]?.name ??
              payload?.newConversion?.[0]?.name ??
              payload?.oldConversion?.[0]?.name ??
              "selection";
            const filename = `figma-node-${sanitizeFilePart(String(firstName))}.json`;

            // Handy when you want to quickly paste into tools.
            const jsonText = JSON.stringify(payload, null, 2);
            copy(jsonText);

            // Basic safety: prevent accidentally downloading extremely large files.
            // (Blob creation is still fine, but this avoids freezing the UI.)
            const approxBytes = new Blob([jsonText]).size;
            const maxBytes = 10 * 1024 * 1024; // 10MB
            if (approxBytes > maxBytes) {
              const ok = window.confirm(
                `JSON is about ${Math.round(approxBytes / 1024 / 1024)}MB. Download anyway?`,
              );
              if (!ok) break;
            }

            downloadJson(payload, filename);
          } catch (e) {
            console.error("[ui] Failed handling selection-json:", e);
          }
          break;

        default:
          break;
      }
    };

    return () => {
      window.onmessage = null;
    };
  }, []);

  const handlePreferencesChange = (
    key: keyof PluginSettings,
    value: boolean | string | number,
  ) => {
    if (state.settings && state.settings[key] === value) {
      // do nothing
    } else {
      postUISettingsChangingMessage(key, value, { targetOrigin: "*" });
    }
  };

  const darkMode = figmaColorBgValue !== "#ffffff";

  return (
    <div className={`${darkMode ? "dark" : ""}`}>
      <PluginUI
        isLoading={state.isLoading}
        code={state.code}
        warnings={state.warnings}
        onPreferenceChanged={handlePreferencesChange}
        htmlPreview={state.htmlPreview}
        settings={state.settings}
        colors={state.colors}
        gradients={state.gradients}
        onDownloadNode={
          state.hasSelection
            ? () => {
                postUIMessage(
                  { type: "get-selection-json" },
                  { targetOrigin: "*" },
                );
              }
            : undefined
        }
      />
    </div>
  );
}

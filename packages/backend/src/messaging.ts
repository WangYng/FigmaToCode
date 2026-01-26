import {
  ConversionMessage,
  ConversionStartMessage,
  EmptyMessage,
  ErrorMessage,
  PluginSettings,
  SettingsChangedMessage,
} from "types";

export const postBackendMessage = figma.ui.postMessage;

export const postEmptyMessage = () =>
  postBackendMessage({ type: "empty" } as EmptyMessage);

export const postConversionStart = () =>
  postBackendMessage({ type: "conversionStart" } as ConversionStartMessage);

export const postConversionComplete = (
  conversionData: ConversionMessage | Omit<ConversionMessage, "type">,
) => postBackendMessage({ ...conversionData, type: "code" });

// Chunked code transfer (used when code is too large for a single postMessage)
export const postCodeChunkStart = (
  payload: Omit<ConversionMessage, "type" | "code">,
  totalChunks: number,
) =>
  postBackendMessage({
    type: "codeChunkStart",
    totalChunks,
    ...payload,
  } as any);

export const postCodeChunk = (index: number, chunk: string) =>
  postBackendMessage({ type: "codeChunk", index, chunk } as any);

export const postCodeChunkEnd = () =>
  postBackendMessage({ type: "codeChunkEnd" } as any);

// Chunked preview transfer (used when htmlPreview.content is too large for a single postMessage)
export const postPreviewChunkStart = (
  totalChunks: number,
  size: { width: number; height: number },
) =>
  postBackendMessage({
    type: "previewChunkStart",
    totalChunks,
    size,
  } as any);

export const postPreviewChunk = (index: number, chunk: string) =>
  postBackendMessage({ type: "previewChunk", index, chunk } as any);

export const postPreviewChunkEnd = () =>
  postBackendMessage({ type: "previewChunkEnd" } as any);

export const postError = (error: string) =>
  postBackendMessage({ type: "error", error } as ErrorMessage);

export const postSettingsChanged = (settings: PluginSettings) =>
  postBackendMessage({
    type: "pluginSettingsChanged",
    settings,
  } as SettingsChangedMessage);

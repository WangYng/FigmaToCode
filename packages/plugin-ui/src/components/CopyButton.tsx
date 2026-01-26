"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Download } from "lucide-react";
import copy from "copy-to-clipboard";
import { cn } from "../lib/utils";

interface CopyButtonProps {
  value: string;
  className?: string;
  showLabel?: boolean;
  successDuration?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /**
   * If the content is too large to reliably copy, show a Download button instead.
   * Defaults to enabled.
   */
  enableDownloadFallback?: boolean;
  /**
   * Byte threshold (UTF-8) beyond which we show Download instead of Copy.
   * Defaults to 512KB.
   */
  downloadThresholdBytes?: number;
  /**
   * Filename to use when downloading. Defaults to "figma-to-code.html".
   */
  downloadFilename?: string;
}

export function CopyButton({
  value,
  className,
  showLabel = true,
  successDuration = 750,
  onMouseEnter,
  onMouseLeave,
  enableDownloadFallback = true,
  downloadThresholdBytes = 512 * 1024,
  downloadFilename = "figma-to-code.html",
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [forceDownload, setForceDownload] = useState(false);

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, successDuration);

      return () => clearTimeout(timer);
    }
  }, [isCopied, successDuration]);

  const getUtf8Bytes = (text: string) => {
    try {
      return new TextEncoder().encode(text).length;
    } catch {
      // Fallback approximation (not exact for non-ASCII, but good enough for thresholding)
      return text.length;
    }
  };

  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildHtmlFile = (source: string) => {
    const trimmed = source.trim();
    const looksLikeFullHtml =
      /^<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
    if (looksLikeFullHtml) return source;

    const looksLikeHtmlSnippet = trimmed.startsWith("<");
    const body = looksLikeHtmlSnippet
      ? source
      : `<pre style="white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \\"Liberation Mono\\", \\"Courier New\\", monospace; font-size: 12px; line-height: 1.5; padding: 16px; margin: 0;">${escapeHtml(source)}</pre>`;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Figma to Code</title>
  </head>
  <body style="margin:0;">
${body}
  </body>
</html>
`;
  };

  const downloadAsHtml = (source: string) => {
    const html = buildHtmlFile(source);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shouldDownload =
    enableDownloadFallback &&
    (forceDownload || getUtf8Bytes(value) > downloadThresholdBytes);

  const handleCopy = async () => {
    try {
      const ok = copy(value);
      if (!ok) {
        if (enableDownloadFallback) {
          setForceDownload(true);
          return;
        }
        return;
      }
      setIsCopied(true);
    } catch (error) {
      console.error("Failed to copy text: ", error);
      if (enableDownloadFallback) {
        setForceDownload(true);
      }
    }
  };

  return (
    <button
      onClick={() => {
        if (shouldDownload) {
          downloadAsHtml(value);
        } else {
          handleCopy();
        }
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        `inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-300`,
        isCopied
          ? "bg-primary text-primary-foreground"
          : "bg-neutral-100 dark:bg-neutral-700 dark:hover:bg-muted-foreground/30 text-foreground",
        className,
        `relative`,
      )}
      aria-label={
        shouldDownload ? "Download as HTML file" : isCopied ? "Copied!" : "Copy to clipboard"
      }
    >
      <div className="relative h-4 w-4 mr-1.5">
        <span
          className={`absolute inset-0 transition-all duration-200 ${
            isCopied
              ? "opacity-0 scale-75 rotate-[-10deg]"
              : "opacity-100 scale-100 rotate-0"
          }`}
        >
          {shouldDownload ? (
            <Download className="h-4 w-4 text-foreground" />
          ) : (
            <Copy className="h-4 w-4 text-foreground" />
          )}
        </span>
        <span
          className={`absolute inset-0 transition-all duration-200 ${
            isCopied
              ? "opacity-100 scale-100 rotate-0"
              : "opacity-0 scale-75 rotate-[10deg]"
          }`}
        >
          <Check className="h-4 w-4 text-primary-foreground" />
        </span>
      </div>

      {showLabel && (
        <span className="font-medium">
          {shouldDownload ? "Download" : isCopied ? "Copied" : "Copy"}
        </span>
      )}

      {isCopied && (
        <span
          className="absolute inset-0 rounded-md animate-pulse bg-primary/10"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

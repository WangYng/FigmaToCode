import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import copy from "copy-to-clipboard";
import type { SVGAsset } from "types";

function SVGAssetTile({ asset }: { asset: SVGAsset }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.svg)}`,
    [asset.svg],
  );

  useEffect(() => {
    setStatus("idle");
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [asset.svg]);

  const handleCopy = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    try {
      setStatus(copy(asset.svg, { format: "text/plain" }) ? "copied" : "error");
    } catch {
      setStatus("error");
    }
    timer.current = setTimeout(() => setStatus("idle"), 1500);
  };

  return (
    <button
      type="button"
      title={asset.name}
      aria-label={`Copy SVG: ${asset.name}`}
      onClick={handleCopy}
      className="svg-asset-tile relative aspect-square w-full min-w-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-600 hover:ring-2 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="absolute inset-3 flex items-center justify-center pointer-events-none">
        <img
          src={preview}
          alt=""
          draggable={false}
          className="block h-full w-full object-contain"
        />
      </span>
      <span role="status" aria-live="polite" className="pointer-events-none">
        {status !== "idle" && (
          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-white/90 dark:bg-neutral-800/95 text-xs font-medium text-foreground">
            {status === "copied" && (
              <Check
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
            )}
            {status === "copied" ? "Copied" : "Copy failed"}
          </span>
        )}
      </span>
    </button>
  );
}

export default function SVGAssetsPanel({ assets }: { assets: SVGAsset[] }) {
  return (
    <section
      aria-label="SVG Assets"
      className="bg-card border w-full rounded-lg p-4 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-lg font-semibold text-foreground">SVG Assets</h2>
        <span className="text-xs bg-muted px-2 py-1 rounded-xl text-muted-foreground">
          {assets.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {assets.map((asset) => (
          <SVGAssetTile key={asset.id} asset={asset} />
        ))}
      </div>
    </section>
  );
}

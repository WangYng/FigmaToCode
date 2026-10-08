import type { SVGAsset } from "types";

interface AssetNode {
  id: string;
  name: string;
  visible?: boolean;
  svg?: string;
  children?: readonly AssetNode[];
}

// Collect after HTML generation, which attaches the exported SVG to each icon.
export function retrieveSVGAssets(nodes: readonly AssetNode[]): SVGAsset[] {
  const assets: SVGAsset[] = [];
  const seen = new Set<string>();
  const visit = (node: AssetNode) => {
    if (node.visible === false || seen.has(node.id)) return;
    seen.add(node.id);
    if (node.svg?.trim()) {
      assets.push({ id: node.id, name: node.name, svg: node.svg });
      return;
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return assets;
}

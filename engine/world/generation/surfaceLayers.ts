import type { ChunkContext } from '../WorldGenerator';

export interface SurfaceLayerBand {
  blockId: number;
  /** How many blocks deep this band extends, starting right under the previous one. */
  depth: number;
}

export interface SurfaceLayerConfig {
  /** The exposed block at the surface (e.g. grass, sand, snow). Omit for a bare-stone surface. */
  top?: SurfaceLayerBand;
  /** The band right under `top` (e.g. dirt). Omit to go straight from `top` to `stoneBlockId`. */
  fill?: SurfaceLayerBand;
  /** Everything deeper than `top`+`fill`. */
  stoneBlockId: number;
}

/**
 * Stamps one column from `height` down to the bottom of the chunk with a simple
 * top/fill/stone layering — the "grass over dirt over stone" pattern every heightmap
 * generator reaches for. For biome-specific wrinkles (a snow line at some elevation, sand
 * near the shore, a noise-patched rock/dirt boundary), call this with the band config for
 * the common case and overwrite the exceptional columns yourself with `ctx.setBlock` —
 * that's the Tier 2 customization path, not a limitation of this helper.
 */
export function applySurfaceLayers(ctx: ChunkContext, x: number, z: number, height: number, layers: SurfaceLayerConfig): void {
  const topDepth = layers.top?.depth ?? 0;
  const fillDepth = layers.fill?.depth ?? 0;
  const yEnd = Math.min(ctx.endY, height + 1);

  for (let y = ctx.startY; y < yEnd; y++) {
    const depth = height - y;
    let blockId = layers.stoneBlockId;
    if (layers.top && depth < topDepth) blockId = layers.top.blockId;
    else if (layers.fill && depth < topDepth + fillDepth) blockId = layers.fill.blockId;
    ctx.setBlock(x, y, z, blockId);
  }
}

export interface OreRule {
  blockId: number;
  /** Matches where the shared noise field is above this (positive) or below this (negative). */
  threshold: number;
  /** Samples its own noise field at this scale instead of sharing the call's field. */
  noiseScale?: number;
}

/**
 * Scatters ore-like veins through stone via 3D noise thresholds — one shared noise field by
 * default (cheap: one sample for the whole rule list), checked against each rule's threshold
 * in order; the first match wins. Returns the matched block id, or `null` for "leave it alone"
 * (the caller decides what that means — usually "keep whatever stone/filler was already there").
 */
export function scatterOres(ctx: ChunkContext, x: number, y: number, z: number, ores: OreRule[], sharedNoiseScale = 3.5): number | null {
  const shared = ctx.simplex.noise3d(x / sharedNoiseScale, y / sharedNoiseScale, z / sharedNoiseScale);
  for (const ore of ores) {
    const n = ore.noiseScale ? ctx.simplex.noise3d(x / ore.noiseScale, y / ore.noiseScale, z / ore.noiseScale) : shared;
    if (ore.threshold >= 0 ? n > ore.threshold : n < ore.threshold) return ore.blockId;
  }
  return null;
}

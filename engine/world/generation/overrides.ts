import type { TerrainLayer } from './terrainLayers';

export interface TerrainOverride {
  /** Checked once per column; the first override whose `contains` returns true wins over the top-level `terrain` array. */
  contains(x: number, z: number): boolean;
  terrain: TerrainLayer[];
}

export interface RegionOptions {
  /** Opposite corners of the box this override applies to. Only the X/Z extent is used — height comes entirely from `terrain`. */
  from: [number, number, number];
  to: [number, number, number];
  terrain: TerrainLayer | TerrainLayer[];
}

/**
 * A rectangular XZ override: inside the box, `terrain` entirely replaces whatever the world's
 * top-level `terrain` array would have produced — e.g. carving a flat pad for a build site out
 * of otherwise mountainous terrain with `region({ from, to, terrain: flatTerrain({ height }) })`.
 */
export function region(options: RegionOptions): TerrainOverride {
  const [x0, , z0] = options.from;
  const [x1, , z1] = options.to;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1);
  const maxZ = Math.max(z0, z1);

  return {
    contains: (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ,
    terrain: Array.isArray(options.terrain) ? options.terrain : [options.terrain]
  };
}

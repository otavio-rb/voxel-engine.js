import { ChunkContext, WorldGenerator } from '../../../core/world/WorldGenerator';
import { BlockType } from '../../../types';

export class AetherWorldGenerator implements WorldGenerator {
  public readonly id = 'aether';

  public generate(ctx: ChunkContext): void {
    // Only generate between Y = 10 and Y = 190
    if (ctx.startY > 200 || ctx.endY < 10) return;

    // ── Pass 1: 3D Density Field for Floating Islands ─────────────────────────
    // The Aether consists of floating heavenly continents and islands.
    // Density > 0 means solid block, <= 0 means open sky.

    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        // Broad continental placement noise
        const continentNoise = ctx.simplex.noise(x / 240, z / 240);
        const detailShape = ctx.simplex.noise((x + 1000) / 75, (z + 1000) / 75);

        for (let y = ctx.startY; y < ctx.endY; y++) {
          if (y < 12 || y > 185) continue;

          let isSolid = false;
          let isAercloud = false;
          let aercloudType = BlockType.ColdAercloud;

          // ── Layer A: Main Continents (Y = 60 to 110, centered ~82) ───────────
          const mainCenterY = 82;
          const mainDistY = Math.abs(y - mainCenterY);
          if (mainDistY < 32 && continentNoise > -0.35) {
            // Asymmetric vertical falloff (steeper on bottom, rolling hills on top)
            const vFactor = y > mainCenterY ? (y - mainCenterY) / 24.0 : (mainCenterY - y) / 18.0;
            const densityBase = 0.55 + continentNoise * 0.45 - vFactor * vFactor;

            // 3D noise carve to produce overhangs, floating arches and terraces
            const n3d = ctx.simplex.noise3d(x / 48, y / 32, z / 48) * 0.5 +
                        ctx.simplex.noise3d(x / 22, y / 16, z / 22) * 0.25;

            if (densityBase + n3d > 0.42) {
              isSolid = true;
            }
          }

          // ── Layer B: Lower Satellite Islets (Y = 28 to 52, centered ~40) ─────
          if (!isSolid) {
            const isletNoise = ctx.simplex.noise((x + 5000) / 110, (z + 5000) / 110);
            if (isletNoise > 0.35) {
              const isletDistY = Math.abs(y - 40);
              if (isletDistY < 12) {
                const vFactor = isletDistY / 10.0;
                const n3d = ctx.simplex.noise3d(x / 24, y / 14, z / 24) * 0.4;
                if (0.5 - vFactor * vFactor + n3d > 0.38) {
                  isSolid = true;
                }
              }
            }
          }

          // ── Layer C: High Sanctuaries / Cloud Islands (Y = 130 to 165, centered ~146)
          if (!isSolid) {
            const highNoise = ctx.simplex.noise((x - 8000) / 160, (z + 8000) / 160);
            if (highNoise > 0.45) {
              const highDistY = Math.abs(y - 146);
              if (highDistY < 16) {
                const vFactor = highDistY / 14.0;
                const n3d = ctx.simplex.noise3d(x / 36, y / 18, z / 36) * 0.45;
                if (0.52 - vFactor * vFactor + n3d > 0.36) {
                  isSolid = true;
                }
              }
            }
          }

          // ── Aercloud Banks (Puffing floating cloud formations) ────────────────
          if (!isSolid) {
            // Lower cloud bank (Y: 22-26)
            if (y >= 22 && y <= 26) {
              const cloudN = ctx.simplex.noise(x / 38, z / 38) + ctx.simplex.noise3d(x / 18, y / 6, z / 18) * 0.3;
              if (cloudN > 0.28) {
                isAercloud = true;
                const typeRand = ctx.simplex.noise((x + 300) / 25, (z + 300) / 25);
                if (typeRand > 0.55) aercloudType = BlockType.BlueAercloud;
                else if (typeRand < -0.55) aercloudType = BlockType.GoldenAercloud;
                else aercloudType = BlockType.ColdAercloud;
              }
            }
            // High cloud stratum (Y: 118-122)
            else if (y >= 118 && y <= 122) {
              const cloudN = ctx.simplex.noise((x + 777) / 44, (z + 888) / 44);
              if (cloudN > 0.36) {
                isAercloud = true;
                aercloudType = cloudN > 0.65 ? BlockType.GoldenAercloud : BlockType.ColdAercloud;
              }
            }
          }

          if (isSolid) {
            // Temporary marker for solid mass; refined in Pass 2
            ctx.setBlock(x, y, z, BlockType.Holystone);
          } else if (isAercloud) {
            ctx.setBlock(x, y, z, aercloudType);
          }
        }
      }
    }

    // ── Pass 2: Strata & Ores (Aether Grass, Aether Dirt, Holystone, Ores) ─────
    for (let x = ctx.startX; x < ctx.endX; x++) {
      for (let z = ctx.startZ; z < ctx.endZ; z++) {
        for (let y = ctx.startY; y < ctx.endY; y++) {
          const block = ctx.getBlock(x, y, z);
          if (block !== BlockType.Holystone) continue;

          const above = ctx.getBlock(x, y + 1, z);
          const aboveIsAir = above === -1 || above === BlockType.ColdAercloud || above === BlockType.BlueAercloud || above === BlockType.GoldenAercloud;
          const below = ctx.getBlock(x, y - 1, z);
          const belowIsAir = below === -1 || below === BlockType.ColdAercloud || below === BlockType.BlueAercloud || below === BlockType.GoldenAercloud;

          // Surface is lush Aether Grass
          if (aboveIsAir) {
            ctx.setBlock(x, y, z, BlockType.AetherGrass);
          }
          // Subsurface (1-2 blocks below surface) is Aether Dirt
          else {
            const above2 = ctx.getBlock(x, y + 2, z);
            const above3 = ctx.getBlock(x, y + 3, z);
            if (above2 === -1 || above3 === -1) {
              ctx.setBlock(x, y, z, BlockType.AetherDirt);
            } else {
              // Deep interior: Holystone with sacred celestial ores
              const oreRand = ctx.simplex.noise3d(x / 4.5, y / 4.5, z / 4.5);
              const rareRand = ctx.simplex.noise3d((x + 4000) / 4.0, y / 4.0, (z + 4000) / 4.0);

              // Gravitite Ore: found near underside and deep interior
              if (belowIsAir || y < 55) {
                if (rareRand > 0.72) {
                  ctx.setBlock(x, y, z, BlockType.GravititeOre);
                  continue;
                }
              }

              // Zanite Ore: purple crystalline ore veins
              if (oreRand > 0.74) {
                ctx.setBlock(x, y, z, BlockType.ZaniteOre);
              }
              // Ambrosium Ore: golden glowing sacred fuel ore
              else if (oreRand < -0.70) {
                ctx.setBlock(x, y, z, BlockType.AmbrosiumOre);
              }
              // Mossy Holystone near island underbellies
              else if (belowIsAir && rareRand > 0.40) {
                ctx.setBlock(x, y, z, BlockType.MossyHolystone);
              }
            }
          }
        }
      }
    }

    // ── Pass 3: Dungeons / Silver Sanctuaries on High Islands ─────────────────
    // High sanctuaries (Y > 130) generate celestial shrines with Carved Holystone pillars and Sun Altars
    const templeGrid = 160;
    const tCellX = Math.floor(ctx.startX / templeGrid);
    const tCellZ = Math.floor(ctx.startZ / templeGrid);

    for (let cdx = -1; cdx <= 1; cdx++) {
      for (let cdz = -1; cdz <= 1; cdz++) {
        const cx = (tCellX + cdx) * templeGrid + templeGrid / 2;
        const cz = (tCellZ + cdz) * templeGrid + templeGrid / 2;

        const templeNoise = ctx.simplex.noise(cx / 300, cz / 300);
        if (templeNoise > 0.45) {
          // Find surface on high island around Y = 145-160
          let surfaceY = -1;
          for (let testY = 165; testY >= 135; testY--) {
            const b = ctx.getBlock(cx, testY, cz);
            if (b === BlockType.AetherGrass || b === BlockType.Holystone) {
              surfaceY = testY;
              break;
            }
          }

          if (surfaceY > 135) {
            this.buildSilverSanctuary(ctx, cx, surfaceY, cz);
          }
        }
      }
    }

    // ── Pass 4: Trees (Skyroot & Golden Oak Trees) ───────────────────────────
    const treeGrid = 14;
    const pad = 8;
    const gxStart = Math.floor((ctx.startX - pad) / treeGrid);
    const gxEnd = Math.ceil((ctx.endX + pad) / treeGrid);
    const gzStart = Math.floor((ctx.startZ - pad) / treeGrid);
    const gzEnd = Math.ceil((ctx.endZ + pad) / treeGrid);

    for (let gx = gxStart; gx <= gxEnd; gx++) {
      for (let gz = gzStart; gz <= gzEnd; gz++) {
        const tx = gx * treeGrid + 7;
        const tz = gz * treeGrid + 7;

        const treeChance = ctx.simplex.noise((tx + 999) / 25, (tz + 888) / 25);
        if (treeChance > 0.28) {
          // Find topmost grass in column
          for (let ty = Math.min(ctx.endY + 15, 175); ty >= Math.max(ctx.startY - 15, 25); ty--) {
            const block = ctx.getBlock(tx, ty, tz);
            if (block === BlockType.AetherGrass) {
              const isGoldenOak = treeChance > 0.65;
              if (isGoldenOak) {
                this.buildGoldenOakTree(ctx, tx, ty, tz, treeChance);
              } else {
                this.buildSkyrootTree(ctx, tx, ty, tz, treeChance);
              }
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Skyroot Tree: elegant straight trunk with cyan/teal canopy
   */
  private buildSkyrootTree(ctx: ChunkContext, x: number, y: number, z: number, seed: number): void {
    const trunkH = 5 + Math.floor((seed * 100) % 4);

    // Trunk
    for (let dy = 1; dy <= trunkH; dy++) {
      ctx.setBlock(x, y + dy, z, BlockType.SkyrootLog);
    }

    // Canopy
    const topY = y + trunkH;
    for (let ly = -2; ly <= 2; ly++) {
      const cy = topY + ly;
      const radius = ly === 2 ? 1 : ly >= 0 ? 2 : 3;

      for (let ox = -radius; ox <= radius; ox++) {
        for (let oz = -radius; oz <= radius; oz++) {
          if (ox === 0 && oz === 0 && ly <= 0) continue; // trunk inside
          if (Math.abs(ox) === radius && Math.abs(oz) === radius && ly !== 0) continue; // round corners

          const cur = ctx.getBlock(x + ox, cy, z + oz);
          if (cur === -1 || cur === BlockType.ColdAercloud) {
            ctx.setBlock(x + ox, cy, z + oz, BlockType.SkyrootLeaves);
          }
        }
      }
    }
  }

  /**
   * Golden Oak Tree: sacred large tree with golden glowing leaves
   */
  private buildGoldenOakTree(ctx: ChunkContext, x: number, y: number, z: number, seed: number): void {
    const trunkH = 7 + Math.floor((seed * 50) % 3);

    // Trunk with slight flare
    for (let dy = 1; dy <= trunkH; dy++) {
      ctx.setBlock(x, y + dy, z, BlockType.Wood);
      if (dy === 1) {
        ctx.setBlock(x + 1, y + dy, z, BlockType.Wood);
        ctx.setBlock(x, y + dy, z + 1, BlockType.Wood);
      }
    }

    // Massive glowing golden canopy
    const topY = y + trunkH;
    const leafRadius = 4;
    for (let dy = -3; dy <= 3; dy++) {
      const cy = topY + dy;
      const r = dy >= 2 ? 2 : dy >= -1 ? leafRadius : 2;

      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          const distSq = ox * ox + oz * oz + (dy * dy) * 1.2;
          if (distSq <= (r + 0.3) * (r + 0.3)) {
            const cur = ctx.getBlock(x + ox, cy, z + oz);
            if (cur === -1 || cur === BlockType.ColdAercloud) {
              ctx.setBlock(x + ox, cy, z + oz, BlockType.GoldenOakLeaves);
            }
          }
        }
      }
    }
  }

  /**
   * Silver Sanctuary Temple on High Islands (Classical Aether Cloud Dungeon)
   */
  private buildSilverSanctuary(ctx: ChunkContext, cx: number, baseSY: number, cz: number): void {
    const platformR = 8;
    const pillarH = 7;

    // Platform floor
    for (let px = -platformR; px <= platformR; px++) {
      for (let pz = -platformR; pz <= platformR; pz++) {
        const d = Math.sqrt(px * px + pz * pz);
        if (d <= platformR) {
          ctx.setBlock(cx + px, baseSY, cz + pz, BlockType.CarvedHolystone);
          ctx.setBlock(cx + px, baseSY - 1, cz + pz, BlockType.Holystone);
        }
      }
    }

    // Circular Carved Holystone Pillars
    const numPillars = 8;
    for (let p = 0; p < numPillars; p++) {
      const angle = (p / numPillars) * Math.PI * 2;
      const pilX = Math.round(cx + Math.cos(angle) * (platformR - 2));
      const pilZ = Math.round(cz + Math.sin(angle) * (platformR - 2));

      for (let py = 1; py <= pillarH; py++) {
        ctx.setBlock(pilX, baseSY + py, pilZ, BlockType.CarvedHolystone);
      }
      // Top arch stones
      ctx.setBlock(pilX, baseSY + pillarH + 1, pilZ, BlockType.GoldenAercloud);
    }

    // Sacred Central Sun Altar with glowing pedestals
    ctx.setBlock(cx, baseSY + 1, cz, BlockType.SunAltar);
    ctx.setBlock(cx, baseSY + 2, cz, BlockType.SunAltar);
    ctx.setBlock(cx + 2, baseSY + 1, cz, BlockType.CarvedHolystone);
    ctx.setBlock(cx - 2, baseSY + 1, cz, BlockType.CarvedHolystone);
    ctx.setBlock(cx, baseSY + 1, cz + 2, BlockType.CarvedHolystone);
    ctx.setBlock(cx, baseSY + 1, cz - 2, BlockType.CarvedHolystone);
  }
}

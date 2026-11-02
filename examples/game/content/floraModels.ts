import { blockRegistry, type MicrovoxelBuilderContext, type MicrovoxelMeshBuilder } from '@voxel/engine/chunk-worker';

export interface MushroomPalette {
  allowCeiling?: boolean;
  stem: [number, number, number];
  cap: [number, number, number];
  top: [number, number, number];
  hasSpots: boolean;
  spot?: [number, number, number];
}

export function createMushroomBuilder(palette: MushroomPalette): MicrovoxelMeshBuilder {
  const [stemR, stemG, stemB] = palette.stem;
  const [capR, capG, capB] = palette.cap;
  const [topR, topG, topB] = palette.top;
  const [spotR, spotG, spotB] = palette.spot ?? [1.0, 1.0, 1.0];
  const hasSpots = palette.hasSpots;

  return (ctx: MicrovoxelBuilderContext) => {
    const { wx, wy, wz, emissive, getNeighbourBlock } = ctx;
    const blockAbove = palette.allowCeiling ? getNeighbourBlock(wx, wy + 1, wz) : -1;
    const isCeiling = Boolean(palette.allowCeiling && blockAbove > 0 && blockRegistry.isSolid(blockAbove));

    const spotEmissive = Math.min(1.0, emissive * 1.35 + 0.15);
    const stemEmissive = emissive * 0.5;
    const addBox = (
      x0: number, y0: number, z0: number,
      x1: number, y1: number, z1: number,
      r: number, g: number, b: number,
      boxEmissive = emissive
    ) => {
      if (isCeiling) {
        ctx.addBox(x0, 1.0 - y1, z0, x1, 1.0 - y0, z1, r, g, b, boxEmissive);
      } else {
        ctx.addBox(x0, y0, z0, x1, y1, z1, r, g, b, boxEmissive);
      }
    };

    const hash = Math.abs(Math.sin(wx * 12.9898 + wy * 78.233 + wz * 45.164) * 43758.5453);
    const variant = Math.floor((hash % 1) * 4);

    if (variant === 0) {
      addBox(0.42, 0.00, 0.42, 0.58, 0.36, 0.58, stemR, stemG, stemB, stemEmissive);
      addBox(0.20, 0.30, 0.20, 0.80, 0.56, 0.80, capR, capG, capB, emissive);
      addBox(0.28, 0.56, 0.28, 0.72, 0.72, 0.72, topR, topG, topB, emissive);
      addBox(0.38, 0.72, 0.38, 0.62, 0.78, 0.62, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.22, 0.46, 0.22, 0.32, 0.56, 0.32, spotR, spotG, spotB, spotEmissive);
        addBox(0.68, 0.46, 0.68, 0.78, 0.56, 0.78, spotR, spotG, spotB, spotEmissive);
        addBox(0.24, 0.48, 0.66, 0.34, 0.58, 0.76, spotR, spotG, spotB, spotEmissive);
        addBox(0.66, 0.48, 0.24, 0.76, 0.58, 0.34, spotR, spotG, spotB, spotEmissive);
        addBox(0.45, 0.74, 0.45, 0.55, 0.80, 0.55, spotR, spotG, spotB, spotEmissive);
      }
    } else if (variant === 1) {
      addBox(0.45, 0.00, 0.44, 0.55, 0.54, 0.54, stemR, stemG, stemB, stemEmissive);
      addBox(0.30, 0.48, 0.29, 0.70, 0.68, 0.69, capR, capG, capB, emissive);
      addBox(0.36, 0.68, 0.35, 0.64, 0.84, 0.63, topR, topG, topB, emissive);
      addBox(0.42, 0.84, 0.41, 0.58, 0.90, 0.57, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.32, 0.58, 0.31, 0.40, 0.68, 0.39, spotR, spotG, spotB, spotEmissive);
        addBox(0.60, 0.60, 0.59, 0.68, 0.70, 0.67, spotR, spotG, spotB, spotEmissive);
        addBox(0.46, 0.86, 0.45, 0.54, 0.92, 0.53, spotR, spotG, spotB, spotEmissive);
      }
    } else if (variant === 2) {
      addBox(0.24, 0.00, 0.28, 0.38, 0.40, 0.42, stemR, stemG, stemB, stemEmissive);
      addBox(0.12, 0.34, 0.16, 0.52, 0.58, 0.56, capR, capG, capB, emissive);
      addBox(0.18, 0.58, 0.22, 0.46, 0.72, 0.50, topR, topG, topB, emissive);
      addBox(0.26, 0.72, 0.30, 0.38, 0.78, 0.42, topR, topG, topB, emissive);

      addBox(0.62, 0.00, 0.60, 0.72, 0.22, 0.70, stemR, stemG, stemB, stemEmissive);
      addBox(0.52, 0.18, 0.50, 0.82, 0.36, 0.80, capR, capG, capB, emissive);
      addBox(0.58, 0.36, 0.56, 0.76, 0.45, 0.74, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.16, 0.48, 0.20, 0.24, 0.56, 0.28, spotR, spotG, spotB, spotEmissive);
        addBox(0.40, 0.50, 0.44, 0.48, 0.58, 0.52, spotR, spotG, spotB, spotEmissive);
        addBox(0.70, 0.30, 0.68, 0.78, 0.38, 0.76, spotR, spotG, spotB, spotEmissive);
      }
    } else {
      addBox(0.43, 0.00, 0.43, 0.57, 0.30, 0.57, stemR, stemG, stemB, stemEmissive);
      addBox(0.22, 0.26, 0.22, 0.78, 0.30, 0.78, stemR * 0.9, stemG * 0.9, stemB * 0.9, stemEmissive);
      addBox(0.10, 0.30, 0.10, 0.90, 0.42, 0.90, capR, capG, capB, emissive);
      addBox(0.26, 0.42, 0.26, 0.74, 0.50, 0.74, topR, topG, topB, emissive);
      addBox(0.40, 0.50, 0.40, 0.60, 0.56, 0.60, topR, topG, topB, emissive);

      if (hasSpots) {
        addBox(0.14, 0.38, 0.46, 0.22, 0.44, 0.54, spotR, spotG, spotB, spotEmissive);
        addBox(0.78, 0.38, 0.46, 0.86, 0.44, 0.54, spotR, spotG, spotB, spotEmissive);
        addBox(0.46, 0.38, 0.14, 0.54, 0.44, 0.22, spotR, spotG, spotB, spotEmissive);
        addBox(0.46, 0.38, 0.78, 0.54, 0.44, 0.86, spotR, spotG, spotB, spotEmissive);
      }
    }
  };
}

export const buildShelfFungus: MicrovoxelMeshBuilder = (ctx) => {
  const { wx, wy, wz, emissive, getNeighbourBlock, addBox } = ctx;
  const nXNeg = getNeighbourBlock(wx - 1, wy, wz);
  const nXPos = getNeighbourBlock(wx + 1, wy, wz);
  const nZNeg = getNeighbourBlock(wx, wy, wz - 1);
  const nZPos = getNeighbourBlock(wx, wy, wz + 1);

  const bR = 0.46, bG = 0.28, bB = 0.16;
  const rR = 0.82, rG = 0.65, rB = 0.42;
  const dR = 0.32, dG = 0.18, dB = 0.10;

  if (nXNeg > 0 && blockRegistry.isSolid(nXNeg)) {
    addBox(0.00, 0.45, 0.20, 0.55, 0.55, 0.80, bR, bG, bB, emissive * 0.8);
    addBox(0.45, 0.47, 0.25, 0.58, 0.54, 0.75, rR, rG, rB, emissive);
    addBox(0.00, 0.55, 0.30, 0.35, 0.62, 0.70, dR, dG, dB, emissive * 0.6);
    addBox(0.00, 0.22, 0.35, 0.40, 0.30, 0.65, bR, bG, bB, emissive * 0.8);
    addBox(0.35, 0.23, 0.38, 0.43, 0.29, 0.62, rR, rG, rB, emissive);
  } else if (nXPos > 0 && blockRegistry.isSolid(nXPos)) {
    addBox(0.45, 0.45, 0.20, 1.00, 0.55, 0.80, bR, bG, bB, emissive * 0.8);
    addBox(0.42, 0.47, 0.25, 0.55, 0.54, 0.75, rR, rG, rB, emissive);
    addBox(0.65, 0.55, 0.30, 1.00, 0.62, 0.70, dR, dG, dB, emissive * 0.6);
    addBox(0.60, 0.22, 0.35, 1.00, 0.30, 0.65, bR, bG, bB, emissive * 0.8);
    addBox(0.57, 0.23, 0.38, 0.65, 0.29, 0.62, rR, rG, rB, emissive);
  } else if (nZNeg > 0 && blockRegistry.isSolid(nZNeg)) {
    addBox(0.20, 0.45, 0.00, 0.80, 0.55, 0.55, bR, bG, bB, emissive * 0.8);
    addBox(0.25, 0.47, 0.45, 0.75, 0.54, 0.58, rR, rG, rB, emissive);
    addBox(0.30, 0.55, 0.00, 0.70, 0.62, 0.35, dR, dG, dB, emissive * 0.6);
    addBox(0.35, 0.22, 0.00, 0.65, 0.30, 0.40, bR, bG, bB, emissive * 0.8);
    addBox(0.38, 0.23, 0.35, 0.62, 0.29, 0.43, rR, rG, rB, emissive);
  } else if (nZPos > 0 && blockRegistry.isSolid(nZPos)) {
    addBox(0.20, 0.45, 0.45, 0.80, 0.55, 1.00, bR, bG, bB, emissive * 0.8);
    addBox(0.25, 0.47, 0.42, 0.75, 0.54, 0.55, rR, rG, rB, emissive);
    addBox(0.30, 0.55, 0.65, 0.70, 0.62, 1.00, dR, dG, dB, emissive * 0.6);
    addBox(0.35, 0.22, 0.60, 0.65, 0.30, 1.00, bR, bG, bB, emissive * 0.8);
    addBox(0.38, 0.23, 0.57, 0.62, 0.29, 0.65, rR, rG, rB, emissive);
  } else {
    addBox(0.42, 0.00, 0.42, 0.58, 0.60, 0.58, bR, bG, bB, emissive * 0.8);
    addBox(0.25, 0.25, 0.25, 0.75, 0.33, 0.75, rR, rG, rB, emissive);
    addBox(0.20, 0.45, 0.20, 0.80, 0.53, 0.80, rR, rG, rB, emissive);
  }
};

export const buildVictoriaRegia: MicrovoxelMeshBuilder = (ctx) => {
  const { wx, wy, wz, emissive, addBox } = ctx;
  const hash = Math.abs(Math.sin(wx * 17.13 + wy * 31.41 + wz * 71.7) * 43758.5453);
  const variant = Math.floor((hash % 1) * 4);
  const flowerEmissive = Math.min(1.0, emissive * 1.4 + 0.2);

  const padG_R = 0.12, padG_G = 0.48, padG_B = 0.16;
  const vein_R = 0.20, vein_G = 0.62, vein_B = 0.24;
  const rimOut_R = 0.48, rimOut_G = 0.16, rimOut_B = 0.24;
  const rimIn_R = 0.18, rimIn_G = 0.54, rimIn_B = 0.20;

  if (variant === 2) {
    addBox(0.04, 0.01, 0.04, 0.68, 0.05, 0.68, padG_R, padG_G, padG_B, emissive * 0.4);
    addBox(0.12, 0.05, 0.02, 0.60, 0.12, 0.06, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    addBox(0.12, 0.05, 0.66, 0.60, 0.12, 0.70, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    addBox(0.02, 0.05, 0.12, 0.06, 0.12, 0.60, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    addBox(0.66, 0.05, 0.12, 0.70, 0.12, 0.60, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);

    addBox(0.28, 0.05, 0.28, 0.44, 0.12, 0.44, 0.96, 0.75, 0.85, flowerEmissive);
    addBox(0.32, 0.12, 0.32, 0.40, 0.18, 0.40, 1.0, 0.90, 0.25, flowerEmissive);

    addBox(0.54, 0.015, 0.54, 0.96, 0.045, 0.96, padG_R * 1.1, padG_G * 1.1, padG_B, emissive * 0.4);
    addBox(0.58, 0.045, 0.52, 0.92, 0.09, 0.56, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    addBox(0.58, 0.045, 0.94, 0.92, 0.09, 0.98, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    addBox(0.52, 0.045, 0.58, 0.56, 0.09, 0.92, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    addBox(0.94, 0.045, 0.58, 0.98, 0.09, 0.92, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
    return;
  }

  addBox(0.08, 0.01, 0.08, 0.92, 0.05, 0.92, padG_R, padG_G, padG_B, emissive * 0.4);
  addBox(0.18, 0.01, 0.04, 0.82, 0.05, 0.96, padG_R, padG_G, padG_B, emissive * 0.4);
  addBox(0.04, 0.01, 0.18, 0.96, 0.05, 0.82, padG_R, padG_G, padG_B, emissive * 0.4);

  addBox(0.14, 0.04, 0.46, 0.86, 0.055, 0.54, vein_R, vein_G, vein_B, emissive * 0.5);
  addBox(0.46, 0.04, 0.14, 0.54, 0.055, 0.86, vein_R, vein_G, vein_B, emissive * 0.5);
  addBox(0.22, 0.04, 0.22, 0.78, 0.055, 0.78, vein_R, vein_G, vein_B, emissive * 0.5);
  addBox(0.22, 0.04, 0.78, 0.78, 0.055, 0.22, vein_R, vein_G, vein_B, emissive * 0.5);

  addBox(0.18, 0.05, 0.04, 0.82, 0.14, 0.09, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.20, 0.13, 0.05, 0.80, 0.15, 0.08, rimIn_R, rimIn_G, rimIn_B, emissive * 0.5);

  addBox(0.18, 0.05, 0.91, 0.44, 0.14, 0.96, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.20, 0.13, 0.92, 0.43, 0.15, 0.95, rimIn_R, rimIn_G, rimIn_B, emissive * 0.5);
  addBox(0.56, 0.05, 0.91, 0.82, 0.14, 0.96, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.57, 0.13, 0.92, 0.80, 0.15, 0.95, rimIn_R, rimIn_G, rimIn_B, emissive * 0.5);

  addBox(0.04, 0.05, 0.18, 0.09, 0.14, 0.82, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.05, 0.13, 0.20, 0.08, 0.15, 0.80, rimIn_R, rimIn_G, rimIn_B, emissive * 0.5);

  addBox(0.91, 0.05, 0.18, 0.96, 0.14, 0.82, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.92, 0.13, 0.20, 0.95, 0.15, 0.80, rimIn_R, rimIn_G, rimIn_B, emissive * 0.5);

  addBox(0.09, 0.05, 0.09, 0.18, 0.13, 0.18, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.82, 0.05, 0.09, 0.91, 0.13, 0.18, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.09, 0.05, 0.82, 0.18, 0.13, 0.91, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);
  addBox(0.82, 0.05, 0.82, 0.91, 0.13, 0.91, rimOut_R, rimOut_G, rimOut_B, emissive * 0.5);

  if (variant === 1) {
    addBox(0.40, 0.05, 0.40, 0.60, 0.10, 0.60, 0.32, 0.48, 0.20, emissive * 0.5);
    addBox(0.42, 0.10, 0.42, 0.58, 0.20, 0.58, 0.88, 0.32, 0.56, flowerEmissive);
    addBox(0.45, 0.20, 0.45, 0.55, 0.26, 0.55, 0.98, 0.60, 0.76, flowerEmissive);
    return;
  }

  const isPureWhite = variant === 3;
  const petOutR = isPureWhite ? 0.95 : 0.98;
  const petOutG = isPureWhite ? 0.95 : 0.68;
  const petOutB = isPureWhite ? 0.98 : 0.82;

  const petInR = 1.0, petInG = 0.96, petInB = 0.92;
  const stamR = 1.0, stamG = 0.86, stamB = 0.18;

  addBox(0.38, 0.05, 0.38, 0.62, 0.09, 0.62, 0.30, 0.42, 0.20, emissive * 0.5);

  addBox(0.28, 0.08, 0.40, 0.72, 0.15, 0.60, petOutR, petOutG, petOutB, flowerEmissive);
  addBox(0.40, 0.08, 0.28, 0.60, 0.15, 0.72, petOutR, petOutG, petOutB, flowerEmissive);
  addBox(0.32, 0.09, 0.32, 0.68, 0.16, 0.68, petOutR * 0.95, petOutG * 0.95, petOutB, flowerEmissive);

  addBox(0.36, 0.13, 0.36, 0.64, 0.22, 0.64, petInR, petInG, petInB, flowerEmissive);
  addBox(0.40, 0.16, 0.40, 0.60, 0.26, 0.60, 1.0, 1.0, 0.98, flowerEmissive);

  addBox(0.44, 0.20, 0.44, 0.56, 0.28, 0.56, stamR, stamG, stamB, Math.min(1.0, emissive * 1.5 + 0.25));

  if (isPureWhite) {
    addBox(0.22, 0.05, 0.34, 0.26, 0.08, 0.38, 0.70, 0.90, 1.0, emissive * 0.6);
    addBox(0.74, 0.05, 0.62, 0.78, 0.08, 0.66, 0.70, 0.90, 1.0, emissive * 0.6);
  }
};

export const buildSporeBlossom: MicrovoxelMeshBuilder = (ctx) => {
  const { wx, wy, wz, emissive, addBox } = ctx;
  const hash = Math.abs(Math.sin(wx * 23.45 + wy * 57.89 + wz * 13.11) * 43758.5453);
  const variant = Math.floor((hash % 1) * 3);
  const glowEmissive = Math.min(1.0, emissive * 1.35 + 0.15);

  addBox(0.44, 0.88, 0.44, 0.56, 1.0, 0.56, 0.22, 0.44, 0.16, emissive * 0.4);
  addBox(0.38, 0.76, 0.38, 0.62, 0.88, 0.62, 0.28, 0.52, 0.18, emissive * 0.5);

  const pR = 0.92, pG = 0.18, pB = 0.54;
  const pLightR = 0.98, pLightG = 0.42, pLightB = 0.72;

  addBox(0.26, 0.64, 0.26, 0.74, 0.76, 0.74, pR, pG, pB, emissive);
  addBox(0.16, 0.50, 0.16, 0.84, 0.64, 0.84, pLightR, pLightG, pLightB, emissive);

  addBox(0.12, 0.34, 0.36, 0.20, 0.52, 0.64, pR, pG, pB, emissive);
  addBox(0.80, 0.34, 0.36, 0.88, 0.52, 0.64, pR, pG, pB, emissive);
  addBox(0.36, 0.34, 0.12, 0.64, 0.52, 0.20, pR, pG, pB, emissive);
  addBox(0.36, 0.34, 0.80, 0.64, 0.52, 0.88, pR, pG, pB, emissive);

  addBox(0.38, 0.46, 0.38, 0.62, 0.62, 0.62, 1.0, 0.88, 0.25, glowEmissive);
  addBox(0.44, 0.38, 0.44, 0.56, 0.48, 0.56, 1.0, 0.98, 0.50, glowEmissive);

  addBox(0.46, 0.22, 0.46, 0.54, 0.30, 0.54, 1.0, 0.85, 0.35, Math.min(1.0, glowEmissive + 0.1));
  if (variant !== 0) {
    addBox(0.30, 0.12, 0.60, 0.36, 0.18, 0.66, 0.96, 0.60, 0.85, glowEmissive);
    addBox(0.62, 0.06, 0.34, 0.68, 0.12, 0.40, 0.98, 0.75, 0.90, glowEmissive);
  }
};

export const buildCaveFlower: MicrovoxelMeshBuilder = (ctx) => {
  const { wx, wy, wz, emissive, addBox } = ctx;
  const hash = Math.abs(Math.sin(wx * 41.17 + wy * 19.33 + wz * 83.51) * 43758.5453);
  const variant = Math.floor((hash % 1) * 4);
  const flowerEmissive = Math.min(1.0, emissive * 1.35 + 0.15);

  addBox(0.44, 0.00, 0.44, 0.56, 0.36, 0.56, 0.26, 0.55, 0.18, emissive * 0.4);
  addBox(0.24, 0.06, 0.34, 0.46, 0.18, 0.56, 0.28, 0.60, 0.20, emissive * 0.4);
  addBox(0.54, 0.08, 0.44, 0.76, 0.20, 0.66, 0.30, 0.64, 0.22, emissive * 0.4);
  addBox(0.36, 0.12, 0.22, 0.58, 0.24, 0.44, 0.24, 0.52, 0.16, emissive * 0.4);

  if (variant === 0) {
    addBox(0.26, 0.30, 0.26, 0.74, 0.48, 0.74, 0.95, 0.32, 0.62, flowerEmissive);
    addBox(0.34, 0.46, 0.34, 0.66, 0.62, 0.66, 0.98, 0.62, 0.80, flowerEmissive);
    addBox(0.42, 0.60, 0.42, 0.58, 0.70, 0.58, 1.0, 0.92, 0.28, Math.min(1.0, flowerEmissive + 0.1));
  } else if (variant === 1) {
    addBox(0.24, 0.32, 0.28, 0.76, 0.48, 0.72, 0.14, 0.78, 0.88, flowerEmissive);
    addBox(0.32, 0.48, 0.32, 0.68, 0.66, 0.68, 0.40, 0.92, 0.98, flowerEmissive);
    addBox(0.43, 0.64, 0.43, 0.57, 0.74, 0.57, 0.88, 1.0, 0.95, Math.min(1.0, flowerEmissive + 0.1));
  } else if (variant === 2) {
    addBox(0.28, 0.28, 0.28, 0.72, 0.46, 0.72, 0.98, 0.68, 0.12, flowerEmissive);
    addBox(0.36, 0.44, 0.36, 0.64, 0.64, 0.64, 1.0, 0.88, 0.28, flowerEmissive);
    addBox(0.44, 0.62, 0.44, 0.56, 0.72, 0.56, 1.0, 1.0, 0.65, Math.min(1.0, flowerEmissive + 0.1));
  } else {
    addBox(0.22, 0.32, 0.22, 0.56, 0.48, 0.56, 0.92, 0.28, 0.58, flowerEmissive);
    addBox(0.28, 0.48, 0.28, 0.50, 0.64, 0.50, 0.98, 0.65, 0.82, flowerEmissive);
    addBox(0.52, 0.22, 0.48, 0.78, 0.38, 0.76, 0.68, 0.38, 0.90, flowerEmissive);
    addBox(0.58, 0.38, 0.54, 0.72, 0.48, 0.70, 0.85, 0.62, 0.98, flowerEmissive);
  }
};

export const buildHangingRoots: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  const rR = 0.48, rG = 0.33, rB = 0.18;
  const mR = 0.30, mG = 0.54, mB = 0.20;

  addBox(0.32, 0.82, 0.32, 0.68, 1.00, 0.68, rR, rG, rB, emissive);
  addBox(0.30, 0.90, 0.30, 0.70, 1.00, 0.70, mR, mG, mB, emissive);

  addBox(0.43, 0.48, 0.43, 0.57, 0.84, 0.57, rR, rG, rB, emissive);
  addBox(0.45, 0.18, 0.43, 0.55, 0.50, 0.53, rR * 0.9, rG * 0.9, rB * 0.9, emissive);
  addBox(0.47, 0.02, 0.46, 0.53, 0.20, 0.52, rR * 0.8, rG * 0.8, rB * 0.8, emissive);

  addBox(0.26, 0.56, 0.30, 0.44, 0.70, 0.44, rR, rG, rB, emissive);
  addBox(0.20, 0.32, 0.28, 0.32, 0.58, 0.38, rR * 0.95, rG * 0.95, rB * 0.95, emissive);
  addBox(0.56, 0.48, 0.54, 0.72, 0.66, 0.66, rR, rG, rB, emissive);
  addBox(0.62, 0.22, 0.58, 0.72, 0.50, 0.68, rR * 0.88, rG * 0.88, rB * 0.88, emissive);
};

export const buildBigDripleaf: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  const stemR = 0.28, stemG = 0.64, stemB = 0.22;
  const leafR = 0.24, leafG = 0.72, leafB = 0.26;
  const veinR = 0.42, veinG = 0.86, veinB = 0.34;
  const dripR = 0.20, dripG = 0.60, dripB = 0.20;

  addBox(0.44, 0.00, 0.44, 0.56, 0.64, 0.56, stemR, stemG, stemB, emissive);
  addBox(0.46, 0.64, 0.46, 0.54, 0.84, 0.54, stemR * 1.05, stemG * 1.05, stemB, emissive);

  addBox(0.32, 0.34, 0.44, 0.44, 0.42, 0.56, stemR, stemG, stemB, emissive);
  addBox(0.12, 0.30, 0.30, 0.36, 0.38, 0.70, leafR, leafG, leafB, emissive);
  addBox(0.08, 0.24, 0.38, 0.16, 0.32, 0.62, dripR, dripG, dripB, emissive);

  addBox(0.38, 0.72, 0.20, 0.90, 0.82, 0.80, leafR, leafG, leafB, emissive);
  addBox(0.40, 0.80, 0.46, 0.86, 0.84, 0.54, veinR, veinG, veinB, emissive * 1.1);

  addBox(0.84, 0.62, 0.30, 0.96, 0.74, 0.70, dripR, dripG, dripB, emissive);
  addBox(0.89, 0.52, 0.46, 0.95, 0.62, 0.54, 0.65, 0.88, 1.0, Math.min(1.0, emissive + 0.2));
};

export const buildCaveVine: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  addBox(0.44, 0.00, 0.44, 0.56, 1.00, 0.56, 0.26, 0.46, 0.16, emissive);
  addBox(0.36, 0.55, 0.40, 0.64, 0.72, 0.60, 0.32, 0.56, 0.20, emissive);
  addBox(0.40, 0.18, 0.36, 0.60, 0.35, 0.64, 0.30, 0.52, 0.18, emissive);
};

export const buildGlowBerries: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  const berryEmissive = Math.min(1.0, emissive * 1.35 + 0.2);
  addBox(0.44, 0.00, 0.44, 0.56, 1.00, 0.56, 0.26, 0.46, 0.16, emissive * 0.4);
  addBox(0.30, 0.12, 0.30, 0.70, 0.52, 0.70, 1.00, 0.74, 0.20, berryEmissive);
  addBox(0.38, 0.04, 0.38, 0.62, 0.12, 0.62, 1.00, 0.90, 0.40, berryEmissive);
  addBox(0.36, 0.60, 0.36, 0.64, 0.72, 0.64, 0.30, 0.54, 0.18, emissive * 0.4);
};

export const buildTallGrass: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  addBox(0.42, 0.00, 0.42, 0.58, 0.82, 0.58, 0.33, 0.68, 0.16, emissive);
  addBox(0.26, 0.00, 0.38, 0.42, 0.60, 0.54, 0.38, 0.74, 0.18, emissive);
  addBox(0.58, 0.00, 0.44, 0.74, 0.48, 0.62, 0.30, 0.62, 0.14, emissive);
};

export function createSurfaceFlowerBuilder(isRed: boolean): MicrovoxelMeshBuilder {
  return ({ emissive, addBox }) => {
    addBox(0.45, 0.00, 0.45, 0.55, 0.58, 0.55, 0.28, 0.55, 0.12, emissive);
    addBox(0.32, 0.20, 0.44, 0.45, 0.30, 0.56, 0.32, 0.60, 0.15, emissive);
    const pr = isRed ? 0.90 : 0.99;
    const pg = isRed ? 0.22 : 0.85;
    const pb = isRed ? 0.21 : 0.21;
    addBox(0.26, 0.54, 0.26, 0.74, 0.76, 0.74, pr, pg, pb, Math.min(1.0, emissive + 0.2));
    const mr = isRed ? 1.0 : 0.88;
    const mg = isRed ? 0.92 : 0.50;
    const mb = isRed ? 0.22 : 0.10;
    addBox(0.38, 0.72, 0.38, 0.62, 0.82, 0.62, mr, mg, mb, Math.min(1.0, emissive + 0.3));
  };
}

export const buildAmethystCluster: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  const crystalEmissive = Math.min(1.0, emissive * 1.35 + 0.25);
  addBox(0.36, 0.00, 0.36, 0.64, 0.76, 0.64, 0.70, 0.53, 0.94, crystalEmissive);
  addBox(0.22, 0.00, 0.34, 0.40, 0.44, 0.52, 0.61, 0.40, 0.88, crystalEmissive);
  addBox(0.60, 0.00, 0.42, 0.78, 0.36, 0.60, 0.79, 0.65, 1.00, crystalEmissive);
};

export const buildGlowLichen: MicrovoxelMeshBuilder = ({ emissive, addBox }) => {
  addBox(0.08, 0.00, 0.08, 0.92, 0.08, 0.92, 0.50, 0.89, 0.63, Math.min(1.0, emissive * 1.25 + 0.2));
};

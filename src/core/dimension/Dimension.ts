import { Vector3 } from 'three';

export interface DimensionAtmosphere {
  /** Identifier for sky rendering mode */
  skyType?: 'skybox' | 'space' | 'hell' | 'void' | 'subterranean';
  daySkyColor: number;
  nightSkyColor: number;
  horizonColor: number;
  ambientDayColor: number;
  ambientNightColor: number;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
  hasDayNightCycle: boolean;
  hasClouds: boolean;
  cloudColor?: number;
  sunScale?: number;
  hasSun: boolean;
  hasMoon: boolean;
  starsVisible?: number; // 0.0 to 1.0
  ambientIntensity?: number;
}

export interface DimensionPhysics {
  /** Base downward gravity acceleration per frame (standard overworld is 0.008) */
  gravity: number;
  /** Air/ground friction multiplier (standard is 0.9) */
  friction?: number;
  /** Jump impulse boost (e.g. 1.0 for normal, 1.4 for low gravity) */
  jumpForce?: number;
  /** Fall damage multiplier or hazard rules */
  fallDamageMultiplier?: number;
}

export interface DimensionCelestialConfig {
  allowStars?: boolean;
  allowPlanets?: boolean;
  allowBlackHoles?: boolean;
}

export interface DimensionDefinition {
  /** Unique identifier (lowercase, e.g. 'overworld', 'nether', 'lunar') */
  readonly id: string;
  /** Human-readable display name */
  readonly name: string;
  /** Description shown in dimension selector or chat */
  readonly description?: string;
  /** ID of the registered WorldGenerator in WorldGeneratorRegistry */
  readonly generatorId: string;
  /** Scale of coordinates relative to the Overworld (e.g., 8.0 for Nether, 1.0 for others) */
  readonly coordinateScale?: number;
  /** Default spawn height offset */
  readonly defaultSpawnY?: number;
  /** Custom portal signature color (for portal blocks and warp FX) */
  readonly portalColor: number;
  /** Environmental physics (gravity, friction, jump) */
  readonly physics: DimensionPhysics;
  /** Atmospheric lighting, sky dome, fog, and celestial appearance */
  readonly atmosphere: DimensionAtmosphere;
  /** Celestial bodies behavior in this dimension */
  readonly celestial?: DimensionCelestialConfig;
}

export interface DimensionTravelOptions {
  /** Explicit destination coordinates (overrides coordinate scaling) */
  targetPosition?: Vector3;
  /** Whether to apply coordinate ratio scaling when moving between dimensions */
  useCoordinateScaling?: boolean;
  /** Automatically find safe solid ground above sea/lava level */
  findSafeSurface?: boolean;
  /** Build a return portal frame at the landing spot */
  createReturnPortal?: boolean;
}

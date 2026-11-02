import { Vector2 } from 'three';

export type WeatherType = 'clear' | 'rain' | 'storm' | 'tornado' | 'sandstorm';

export interface WeatherPreset {
  type: WeatherType;
  name: string;
  label: string;
  /** Cloud coverage/density in sky (0.0 clear to 1.0 overcast storm) */
  cloudDensity: number;
  /** Tint color of the clouds */
  cloudColor: number;
  /** Sky dome daytime color */
  skyColor: number;
  /** Distance fog near start (blocks) */
  fogNear: number;
  /** Distance fog far end (blocks) */
  fogFar: number;
  /** Fog color */
  fogColor: number;
  /** Sunlight and ambient illumination multiplier (0.1 to 1.0) */
  daylightMultiplier: number;
  /** Wind strength (blocks per second) */
  windSpeed: number;
  /** Direction vector of the wind (normalized 2D xz) */
  windDir: Vector2;
  /** Rain droplet emission rate (0 to 1) */
  rainIntensity: number;
  /** Sandstorm particle rate (0 to 1) */
  sandIntensity: number;
  /** Storm severity (0 to 1): controls choppiness, thunder probability */
  stormIntensity: number;
  /** Average seconds between natural lightning strikes (0 = none) */
  lightningInterval: number;
}

export const WEATHER_PRESETS: Record<WeatherType, WeatherPreset> = {
  clear: {
    type: 'clear',
    name: 'clear',
    label: 'Céu Limpo',
    cloudDensity: 0.0,
    cloudColor: 0xffffff,
    skyColor: 0x87ceeb,
    fogNear: 128,
    fogFar: 256,
    fogColor: 0x87ceeb,
    daylightMultiplier: 1.0,
    windSpeed: 2.0,
    windDir: new Vector2(1, 0.2).normalize(),
    rainIntensity: 0.0,
    sandIntensity: 0.0,
    stormIntensity: 0.0,
    lightningInterval: 0,
  },
  rain: {
    type: 'rain',
    name: 'rain',
    label: 'Chuva',
    cloudDensity: 0.75,
    cloudColor: 0x7c8594,
    skyColor: 0x62738a,
    fogNear: 45,
    fogFar: 140,
    fogColor: 0x6e7b8c,
    daylightMultiplier: 0.65,
    windSpeed: 8.0,
    windDir: new Vector2(0.8, 0.6).normalize(),
    rainIntensity: 0.75,
    sandIntensity: 0.0,
    stormIntensity: 0.25,
    lightningInterval: 35,
  },
  storm: {
    type: 'storm',
    name: 'storm',
    label: 'Tempestade de Raios',
    cloudDensity: 0.98,
    cloudColor: 0x222630,
    skyColor: 0x2a313d,
    fogNear: 25,
    fogFar: 90,
    fogColor: 0x28303d,
    daylightMultiplier: 0.22,
    windSpeed: 18.0,
    windDir: new Vector2(0.7, 0.7).normalize(),
    rainIntensity: 1.0,
    sandIntensity: 0.0,
    stormIntensity: 0.9,
    lightningInterval: 6,
  },
  tornado: {
    type: 'tornado',
    name: 'tornado',
    label: 'Tempestade com Tornado',
    cloudDensity: 1.0,
    cloudColor: 0x181a20,
    skyColor: 0x20242c,
    fogNear: 18,
    fogFar: 75,
    fogColor: 0x1f242d,
    daylightMultiplier: 0.16,
    windSpeed: 32.0,
    windDir: new Vector2(0.9, 0.4).normalize(),
    rainIntensity: 0.85,
    sandIntensity: 0.0,
    stormIntensity: 1.0,
    lightningInterval: 4,
  },
  sandstorm: {
    type: 'sandstorm',
    name: 'sandstorm',
    label: 'Tempestade de Areia',
    cloudDensity: 0.05,
    cloudColor: 0xd9b37c,
    skyColor: 0xc89855,
    fogNear: 12,
    fogFar: 48,
    fogColor: 0xb58242,
    daylightMultiplier: 0.42,
    windSpeed: 28.0,
    windDir: new Vector2(-0.9, 0.4).normalize(),
    rainIntensity: 0.0,
    sandIntensity: 1.0,
    stormIntensity: 0.65,
    lightningInterval: 0,
  }
};

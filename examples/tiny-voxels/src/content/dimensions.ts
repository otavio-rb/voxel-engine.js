import { dimensionRegistry } from '@voxel/engine/worker';

export function registerDimensions(): void {
  dimensionRegistry.register({
    id: 'micro_world',
    name: 'Micro Voxel World',
    description: 'Mundo procedural em alta resolução com micro-detalhes, terraços geológicos e vegetação densa.',
    generatorId: 'micro_terrain',
    coordinateScale: 1.0,
    // Em voxels: 24 blocos acima da origem, com 16 voxels por bloco.
    defaultSpawnY: 94 * 25,
    accentColor: 0x00f0ff,
    physics: {
      gravity: 0.008,
      friction: 0.9,
      jumpForce: 0.16
    },
    atmosphere: {
      skyType: 'skybox',
      daySkyColor: 0x88ccff,
      nightSkyColor: 0x0a0c16,
      horizonColor: 0xe0e8f5,
      ambientDayColor: 0xa0d0ff,
      ambientNightColor: 0x14182b,
      // Em METROS, e dimensionada pelo ANEL DISTANTE, nao pelo fino.
      //
      // Estava em 11/19, acompanhando os 20 m de resolucao cheia. Com o anel de LOD indo a
      // 200 m isso seria duas vezes errado: a nevoa apagaria todo o campo distante, e como
      // `uFogFar` tambem limita ate onde o raio marcha, o anel nem chegaria a ser tracado.
      fogNear: 70.0,
      fogFar: 190.0,
      hasDayNightCycle: true,
      hasClouds: true,
      cloudColor: 0xffffff,
      sunScale: 1.2,
      hasSun: true,
      hasMoon: true,
      starsVisible: 0.3,
      ambientIntensity: 0.85
    }
  });
}
